# Shared UI components

## `_FoodCard`

- Source: `lib/main.dart`
- Role: reusable fixed-width food card used by the horizontal reel.
- Props: `food`, `highlighted`.

```dart
class _FoodCard extends StatelessWidget {
  const _FoodCard({super.key, required this.food, required this.highlighted});

  final FoodItem food;
  final bool highlighted;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return AnimatedContainer(
      duration: const Duration(milliseconds: 220),
      width: _FoodSpinnerPageState._cardWidth,
      height: 144,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: highlighted
              ? const [Color(0xFF6A4300), Color(0xFF2A1D08)]
              : const [Color(0xFF2A2E39), Color(0xFF1C1F27)],
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: highlighted ? colors.primary : colors.outlineVariant,
          width: highlighted ? 2 : 1,
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(food.icon, size: 42, color: colors.primary),
          const SizedBox(height: 12),
          Text(
            food.name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}
```

No third-party component library is used. All controls are Flutter Material 3 widgets.
