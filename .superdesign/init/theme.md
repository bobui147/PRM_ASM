# Theme

## Compact token summary

- Framework: Flutter Material Design 3.
- Brightness: dark.
- Seed/accent: `#FFA726` (warm amber/orange).
- Scaffold background: `#0D0F14`.
- Reel surface: `#171A22`.
- Default card gradient: `#2A2E39` -> `#1C1F27`.
- Highlighted card gradient: `#6A4300` -> `#2A1D08`.
- Border radius: 14px cards, 20px reel.
- Reel card size: 132x144; gap 12.
- Emphasis: amber borders, low-alpha amber glow, heavy title/button weights.
- Typography: platform Material typography; no custom font or font asset.
- Layout: 16px page padding, vertically centered single-column mobile layout.
- Motion: 4500ms `easeOutCubic` horizontal reel; 220ms card highlight transition.

## Raw theme source

```dart
ThemeData(
  colorScheme: ColorScheme.fromSeed(
    seedColor: const Color(0xFFFFA726),
    brightness: Brightness.dark,
  ),
  scaffoldBackgroundColor: const Color(0xFF0D0F14),
  useMaterial3: true,
)
```

There is no CSS, Tailwind configuration, separate design-token file, or theme provider.
