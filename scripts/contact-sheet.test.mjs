import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSheet, planSheetSizes } from '../src/vendor/diffusionstudio/contact-sheet.ts';

test('all supported layouts fit image budget without enlarging source or losing cells', () => {
  for (const source of [{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, { width: 100, height: 100 }]) {
    for (let count = 1; count <= 12; count++) {
      const plan = planSheet(count, source);
      assert.ok(plan.width <= 2576 && plan.height <= 1456);
      assert.ok(plan.cellWidth <= source.width && plan.cellHeight <= source.height);
      assert.ok(plan.columns * plan.rows >= count);
      assert.ok(plan.cellWidth > 0 && plan.cellHeight > 0);
    }
  }
  assert.deepEqual(planSheetSizes(13), [7, 6]);
});
