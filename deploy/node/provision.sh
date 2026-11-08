#!/usr/bin/env bash
# Invoked only by the authenticated root Node Runtime, never by an Agent tool or business Pod.
set -euo pipefail
id=${1:?desktop UUID}; volume=${2:?volume UUID}; slot=${3:?node slot}
[[ "$id" =~ ^[0-9a-f-]{36}$ && "$volume" =~ ^[0-9a-f-]{36}$ && "$slot" =~ ^[0-9]+$ ]] || exit 2
(( EUID == 0 && slot > 0 && slot < 4096 )) || exit 2
test -c /dev/kvm
test -x "${FIRECRACKER_BIN:?}"; test -x "${JAILER_BIN:?}"
test -f "${GUEST_KERNEL:?}"; test -f "${BASE_ROOTFS:?}"
root="${JAILER_ROOT:?}/firecracker/$id/root"; disk="${VOLUME_ROOT:?}/$volume.ext4"
uid=$((10000+slot)); octet=$((slot/64)); subnet=$(((slot%64)*4))
gateway="172.30.$octet.$((subnet+1))"; guest="172.30.$octet.$((subnet+2))"; tap="eob$slot"
# Refuse volume mutation while the VM is alive. A reconnected control service only observes it.
if systemctl is-active --quiet "eob-vm@$id"; then exit 0; fi
mkdir -p "$VOLUME_ROOT" "$root/run" /etc/eob/vms
if [[ ! -e "$disk" ]]; then
  # Initialize ONCE. Subsequent starts reuse exactly this volume, never overwrite it from the template.
  initializing=$(mktemp --tmpdir="$VOLUME_ROOT" "$volume.initializing.XXXXXX")
  cp --reflink=auto --sparse=always "$BASE_ROOTFS" "$initializing"
  truncate -s "${VM_DISK_BYTES:-40000000000}" "$initializing"
  tune2fs -U random "$initializing"
  resize2fs "$initializing"
  sync -f "$initializing"
  mv -n "$initializing" "$disk"
fi
mountdir=$(mktemp -d)
cleanup() { mountpoint -q "$mountdir" && umount "$mountdir"; rmdir "$mountdir"; }
trap cleanup EXIT
mount -o loop "$disk" "$mountdir"
mkdir -p "$mountdir/etc/eob" "$mountdir/etc/systemd/network"
# systemd EnvironmentFile quoting; the user identifier never becomes a shell command.
python3 - "$mountdir/etc/eob/guest.env" "$id" "$guest" "$gateway" <<'PY'
import json,os,sys
path,desktop,ip,gateway=sys.argv[1:]
values={k:os.environ[k] for k in ['GUEST_USER_ID','GUEST_TOKEN','GUEST_EPOCH']}
values.update(GUEST_DESKTOP_ID=desktop,LISTEN_ADDR=':8088',WORKSPACE_ROOT='/data',GUEST_CALLBACK_URL=f'http://{gateway}:8090/v1/guest-events')
for key,default in {'SCREEN_WIDTH':'1280','SCREEN_HEIGHT':'720','SCREEN_LIMIT':'4','JOB_TIMEOUT_SECONDS':'300','ALLOWED_TOOLS':'write_file,python','ARTIFACT_MAX_MIB':'10','REQUEST_MAX_MIB':'16'}.items():values[key]=os.environ.get(key,default)
with open(path,'w') as f:
 for k,v in values.items():f.write(k+'='+json.dumps(v)+'\n')
os.chmod(path,0o600)
PY
printf '[Match]\nName=eth0\n[Network]\nAddress=%s/30\nGateway=%s\nDNS=1.1.1.1\n' "$guest" "$gateway" > "$mountdir/etc/systemd/network/10-eth0.network"
sync -f "$mountdir"
umount "$mountdir"
install -m 0444 "$GUEST_KERNEL" "$root/kernel"
if ! mountpoint -q "$root/rootfs.ext4"; then touch "$root/rootfs.ext4"; mount --bind "$disk" "$root/rootfs.ext4"; fi
chown "$uid:$uid" "$disk" "$root" "$root/run"
if ! ip link show "$tap" >/dev/null 2>&1; then ip tuntap add dev "$tap" mode tap user "$uid"; fi
ip addr replace "$gateway/30" dev "$tap"; ip link set "$tap" up
sysctl -w net.ipv4.ip_forward=1 >/dev/null
# Deny Guest access to other users, management/private networks and cloud metadata; allow only its callback port on the host.
chain="EOB_$slot"
iptables -N "$chain" 2>/dev/null || true
iptables -F "$chain"
iptables -A "$chain" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
for cidr in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16; do iptables -A "$chain" -d "$cidr" -j REJECT; done
iptables -A "$chain" -j ACCEPT
iptables -C FORWARD -i "$tap" -j "$chain" 2>/dev/null || iptables -I FORWARD -i "$tap" -j "$chain"
iptables -C FORWARD -o "$tap" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || iptables -I FORWARD -o "$tap" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -C INPUT -i "$tap" -j REJECT 2>/dev/null || iptables -I INPUT -i "$tap" -j REJECT
iptables -C INPUT -i "$tap" -p tcp --dport 8090 -j ACCEPT 2>/dev/null || iptables -I INPUT -i "$tap" -p tcp --dport 8090 -j ACCEPT
iptables -C INPUT -i "$tap" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT 2>/dev/null || iptables -I INPUT -i "$tap" -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -t nat -C POSTROUTING -s "$guest/32" -o "${NODE_EGRESS_INTERFACE:?}" -j MASQUERADE 2>/dev/null || iptables -t nat -A POSTROUTING -s "$guest/32" -o "$NODE_EGRESS_INTERFACE" -j MASQUERADE
# No IPv6 configured on the per-user TAP.
sysctl -w "net.ipv6.conf.$tap.disable_ipv6=1" >/dev/null
python3 - "$root/vm.json" "$tap" <<'PY'
import json,os,sys
config={'boot-source':{'kernel_image_path':'/kernel','boot_args':'console=ttyS0 reboot=k panic=1 pci=off root=/dev/vda rw'},'drives':[{'drive_id':'rootfs','path_on_host':'/rootfs.ext4','is_root_device':True,'is_read_only':False,'cache_type':'Writeback'}],'machine-config':{'vcpu_count':int(os.environ.get('VM_VCPU','2')),'mem_size_mib':int(os.environ.get('VM_MEMORY_MIB','4096'))},'network-interfaces':[{'iface_id':'eth0','host_dev_name':sys.argv[2],'guest_mac':'06:00:ac:10:00:02'}]}
with open(sys.argv[1],'w') as f:json.dump(config,f)
PY
chmod 0444 "$root/vm.json"
printf 'VM_UID=%s\n' "$uid" > "/etc/eob/vms/$id.env"
systemctl set-property --runtime "eob-vm@$id.service" "MemoryMax=$(( (${VM_MEMORY_MIB:-4096}+256)*1024*1024 ))" "CPUQuota=$(( ${VM_VCPU:-2}*100 ))%"
systemctl start "eob-vm@$id.service"
