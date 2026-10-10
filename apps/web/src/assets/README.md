# Arena art v6 — GESTURE ARENA

本次美術：低飽和山間石造演武場；雙方都是兜帽長袍法師，紅藍染色。素材由 Codex 內建 imagegen 製作，無新增遠端載入或商用素材依賴。

## Assets

- `terrace-v6.png`: static background; displayed at 1920×1200 and cropped by the 1920×1080 viewport to align the walking plane with y=900.
- `mage-sheet-v6.png`: RGBA 1536×1024, regular 3×2 sheet, 512×512 frames. 0 idle, 1/2 walk, 3 crouch, 4 cast, 5 guard. Feet baselines [489,484,484,449,461,463] are anchored per frame so feet stay grounded. Runtime scale .36, red/blue tint.
- `../arena.tsx`: scene composition, animation selection, restrained procedural spell details, mirrored framed HUD.

The original gameplay coordinates, collision boxes, skill preparation/active windows, damage, controls and server rules are unchanged. Decorative strokes follow the existing skill shape; bright outer edges show the hit bounds. Player art may extend outside collision boxes like conventional fighter art; practice debug boxes remain available. No moon, HUD stat/skill captions, camera shake or ambient particles.

Assets are bundled locally by Vite and included in the source delivery. Background is one static texture. Six poses use one shared atlas for both players. All runtime effects use existing Phaser graphics; no shader pipeline or per-frame texture allocations.

## Generation prompts (built-in imagegen)

### Background

Use case: stylized-concept. Asset type: production background plate for a 1920x1080 side-view fighting game called GESTURE ARENA. Generate a wide 16:9 high-quality hand-painted game environment, no UI or characters. An ancient stone sparring terrace at blue-hour dusk, understated East Asian monastery architecture at the far left and right edges, layered distant misty mountain ridges and weathered stone balustrades. Premium painterly 2.5D game art, believable stone textures and subtle atmospheric depth, disciplined composition. Camera fixed straight-on from the side, no tilt. A completely flat horizontal walking line exactly at 83.3 percent of image height; the lower one-sixth is the front face of a broad stone terrace with restrained stone detail. Keep the central combat area from 15–85 percent width, 45–83 percent height open, muted and free of props so bright fighters and effects are readable. Top 20 percent low-detail dark slate sky for health bars. Palette charcoal, muted blue-gray, desaturated teal; tiny warm amber lantern accents only at extreme edges. Soft indirect light, clear silhouettes, elegant and calm, large broad masses rather than noisy detail. No moon, no sun disc, no stars, no glowing magic circles, no vegetation in front of combatants, no flags across the middle, no characters, no floating particles, no dramatic light shafts, no bright center focal point, no text, no watermark. The result is an actual background asset, not a screenshot mockup.

### Mage sprite sheet

Production transparent sprite sheet for a premium 2D side-view fighting game: exactly 3 columns by 2 rows, six equally sized cells on a 1536x1024 canvas. ONE identical adult arcane MAGE in all six cells, facing RIGHT. Clearly a sorcerer: hooded charcoal and slate layered long wizard robes to shins, ivory embroidered stole, soft cloth sleeves, silver arcane bracers, belted waist, boots, anonymous shadowed face. No armor, no martial-arts tunic, no weapon. Elegant athletic magical duelist, polished painterly game sprite, restrained grayscale palette for in-engine red/blue tint, clear silhouettes and ivory highlights. Poses reading order: neutral spellcasting idle with hands open; walking step A; walking step B; crouching; casting with right open palm extended and left hand near chest; magical guarding both open palms forward. Exact same costume and scale. Each figure fully contained within its regular cell with transparent margins, torso centered local x256, feet baseline local y470. Standing figure 390 pixels high; crouch 240 pixels high. Actual transparent alpha background, no floor or shadows, no glow, no magic particles, no borders, no labels or text. Production animation asset, not a mockup. Six frames only.
