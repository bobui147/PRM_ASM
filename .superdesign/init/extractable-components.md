# Extractable components

## FoodCard

- Source: `lib/main.dart` (`_FoodCard`)
- Category: basic
- Description: fixed-width dark food card with icon, title, border, and selected highlight.
- Extractable props: `highlighted`.
- Hardcoded: card dimensions, gradient, border radius, icon size, typography.

There are no shared navigation, shell, or multi-page layout components. `FoodCard` is a basic primitive and should remain inline in a Superdesign draft rather than be extracted as a remote component.
