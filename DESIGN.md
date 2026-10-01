# Existing application design

Preserve the current dark desktop workspace, where the animation canvas is the primary content and subdued panels keep attention on the preview. This follows the user's preference to continue the existing design.

Reuse the semantic colors in `src/index.css` and `src/styles/base.css`, the existing Inter font, Lucide icons, and button/input components. Use background, card, muted, foreground, border, and destructive tokens rather than introducing independent palettes.

The scene workspace places conversation on the left, scenes and playback below the preview, and properties on the right. Panels must scroll internally and leave room for desktop window controls. Use clear loading, disabled, running, cancelled, and failed states. Avoid decorative animation.
