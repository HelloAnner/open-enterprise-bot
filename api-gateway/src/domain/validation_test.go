package domain

import "testing"

func TestEditableBotBoundary(t *testing.T) {
	for _, patch := range []map[string]any{{"user_id": "other"}, {"id": "other"}, {"shape": "unknown"}, {"color": "javascript:alert(1)"}, {"name": " "}, {"pinned": "yes"}} {
		if BotPatch(patch) == nil {
			t.Fatalf("accepted unsafe patch: %v", patch)
		}
	}
	if e := BotPatch(map[string]any{"name": "Assistant", "shape": "circle", "color": "#2589f5", "pinned": true}); e != nil {
		t.Fatal(e)
	}
}
