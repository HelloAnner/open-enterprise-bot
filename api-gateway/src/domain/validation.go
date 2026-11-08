package domain

import (
	"fmt"
	"regexp"
	"strings"
)

var shapes = map[string]bool{"circle": true, "bean": true, "square": true, "spark": true, "flower": true, "cloud": true, "splat": true, "drop": true, "pill": true, "triangle": true, "home": true, "pebble": true, "hex": true}
var color = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func BotPatch(p map[string]any) error {
	for k, v := range p {
		switch k {
		case "name", "group":
			s, ok := v.(string)
			if !ok || strings.TrimSpace(s) == "" || len(s) > 200 {
				return fmt.Errorf("invalid %s", k)
			}
		case "shape":
			s, _ := v.(string)
			if !shapes[s] {
				return fmt.Errorf("invalid shape")
			}
		case "color", "accent":
			s, _ := v.(string)
			if !color.MatchString(s) {
				return fmt.Errorf("invalid color")
			}
		case "hidden", "pinned", "unread":
			if _, ok := v.(bool); !ok {
				return fmt.Errorf("invalid %s", k)
			}
		default:
			return fmt.Errorf("field %s is not editable", k)
		}
	}
	return nil
}
