# Manual Testing Guide for Tooltip Changes

## Setup
1. Start the dev server: `npm run dev`
2. Open the workflow editor in your browser

## Test Cases

### Test 1: Python Node Tooltip (Accuracy Fix)
**Steps:**
1. Create or open a workflow with a Python node
2. Hover over the Python node
3. **Expected:** Tooltip should say "Executes Python code on your local environment"
4. **Should NOT say:** "sandboxed environment"

### Test 2: Built-in Node Types (Regression Test)
**Steps:**
For each built-in type, create a node and hover over it:
- [ ] Agent node - should show tooltip
- [ ] Human node - should show tooltip  
- [ ] Python node - should show tooltip (with correct text)
- [ ] Passthrough node - should show tooltip
- [ ] Literal node - should show tooltip
- [ ] Loop_counter node - should show tooltip
- [ ] Subgraph node - should show tooltip

### Test 3: Custom/Unknown Node Types (New Behavior)
**Steps:**
1. Create a workflow with a custom node type (not in the built-in list)
2. Hover over the custom node
3. **Expected:** NO tooltip should appear
4. **Should NOT show:** "Help content coming soon."

### Test 4: Console Warnings
**Steps:**
1. Open browser console (F12)
2. Hover over a custom/unknown node type
3. **Expected:** No warnings about missing help content
4. Console should be clean

## Pass Criteria
- ✅ All built-in nodes show appropriate tooltips
- ✅ Python node shows accurate non-sandboxed description
- ✅ Custom nodes show NO tooltip
- ✅ No console errors or warnings
