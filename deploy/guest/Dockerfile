# Export this userspace into an ext4 rootfs; do not run it as another Kubernetes business Deployment.
FROM debian:bookworm-slim
ARG CHROME_DEB_URL
ARG CHROME_SHA256
RUN test -n "$CHROME_DEB_URL" && test -n "$CHROME_SHA256" && \
    apt-get update && apt-get install -y --no-install-recommends systemd systemd-sysv systemd-resolved dbus curl ca-certificates \
    xvfb x11vnc x11-utils openbox thunar xterm python3 python3-venv python3-pip bash coreutils \
    fonts-noto-cjk fonts-noto-color-emoji fonts-dejavu fonts-liberation iproute2 procps && \
    curl -fsSL "$CHROME_DEB_URL" -o /tmp/chrome.deb && \
    echo "$CHROME_SHA256  /tmp/chrome.deb" | sha256sum -c - && \
    apt-get install -y /tmp/chrome.deb && rm -rf /var/lib/apt/lists/* /tmp/chrome.deb && \
    useradd --create-home --uid 1000 --shell /bin/bash bot && \
    mkdir -p /data /etc/eob /data/browser && chown -R bot:bot /data && \
    systemctl enable systemd-networkd systemd-resolved && \
    ln -sf /run/systemd/resolve/resolv.conf /etc/resolv.conf
COPY .build/compute-agent /usr/local/bin/compute-agent
COPY eob-*.service /etc/systemd/system/
RUN chmod 0755 /usr/local/bin/compute-agent && \
    systemctl enable eob-display eob-desktop eob-browser eob-compute-agent
CMD ["/sbin/init"]
