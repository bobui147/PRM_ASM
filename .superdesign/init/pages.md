# Page dependency trees

## `/` — Food spinner

Entry: `lib/main.dart`

Dependencies:
- `lib/main.dart`
  - Flutter SDK: `package:flutter/material.dart`
  - Dart SDK: `dart:math`

Local UI tree:
- `MyApp`
  - `FoodSpinnerPage`
    - horizontal reel built in `_buildSpinner`
      - `_FoodCard`
    - empty state built in `_buildEmptyState`
    - Material `FilledButton`
    - inline result text

Tests:
- `test/widget_test.dart`
  - imports `package:prmgr5/main.dart`
