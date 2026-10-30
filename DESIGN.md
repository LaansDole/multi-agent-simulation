---
name: DynamiClinic project site
description: Evidence pages for a clinical multi-agent research prototype, set like the findings section of a systematic review.
colors:
  review-plum: "#6b1f4f"
  review-plum-deep: "#4f1239"
  plum-wash: "#f6eef3"
  paper: "#ffffff"
  ink: "#1b1b1f"
  ink-secondary: "#4a454d"
  hairline: "#d9d3d7"
  hairline-soft: "#ece8eb"
  code-ground: "#f6f4f5"
typography:
  headline:
    fontFamily: "Source Serif 4, Iowan Old Style, Georgia, serif"
    fontSize: "clamp(32px, 3.6vw, 46px)"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.018em"
  title:
    fontFamily: "Source Serif 4, Iowan Old Style, Georgia, serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Source Serif 4, Iowan Old Style, Georgia, serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.62
  label:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.45
  caption:
    fontFamily: "Source Sans 3, Segoe UI, system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.5
  code:
    fontFamily: "Source Code Pro, ui-monospace, Menlo, monospace"
    fontSize: "0.84em"
    fontWeight: 400
rounded:
  none: "0px"
  hairline: "2px"
spacing:
  row: "8px"
  block: "14px"
  figure: "26px"
  section: "64px"
components:
  nav-link-current:
    textColor: "{colors.ink}"
    typography: "{typography.label}"
  link:
    textColor: "{colors.review-plum}"
  link-hover:
    textColor: "{colors.review-plum-deep}"
  step-current:
    backgroundColor: "{colors.plum-wash}"
    textColor: "{colors.ink}"
  table-cell-wrong:
    backgroundColor: "{colors.plum-wash}"
    textColor: "{colors.review-plum-deep}"
  code-inline:
    backgroundColor: "{colors.code-ground}"
    typography: "{typography.code}"
    rounded: "{rounded.hairline}"
---

# Design System: DynamiClinic project site

## Overview

**Creative North Star: "The Evidence Table"**

The site reads like the results and appendix of a systematic review. Reviewers come to check claims, so every claim sits next to its interval, its recorded run, or its status mark. The world lives in the frame and the apparatus: a plum masthead rule, booktabs tables, forest plots, numbered figures and one numbered equation. The reading column stays calm, set in a serif on white paper and running the full width of the column.

Bad news gets the same typographic weight as good news. A result that favours the single agent is plotted the same way as one that favours the team. A "missing" status gets the same mark anatomy as a "matches".

**Key Characteristics:**
- White paper, near-black ink, one plum accent, warm grey hairlines.
- Serif for reading and headings; humanist sans for the apparatus; mono only for code and identifiers.
- Rules, not boxes. There are no cards, panels or shadows.
- Data devices: forest plots, four-dot status marks and booktabs tables.

## Colors

The palette is restrained: one accent over neutrals tinted toward the plum.

### Primary
- **Review Plum** (review-plum): the masthead rule, links, forest-plot estimates, status dots, run-in labels, the current nav item's underline and list markers. It is the only saturated colour on the page.
- **Deep Plum** (review-plum-deep): link hover, and the text of wrong-answer cells.

### Neutral
- **Paper** (paper): the ground of every page. The site is read in daylight at a desk, so it is light by scene, not by category.
- **Ink** (ink): body text, headings, table top and bottom rules, interval bars.
- **Secondary Ink** (ink-secondary): captions, meta lines, axis labels, table sub-lines.
- **Hairline** (hairline) and **Soft Hairline** (hairline-soft): rules between rows and plot gridlines.
- **Plum Wash** (plum-wash): the background for the current step, a hovered step and wrong cells. It is never used as a page or panel ground.
- **Code Ground** (code-ground): inline code and code blocks only.

### Named Rules
**The One Plum Rule.** Plum is the only accent. A second hue never carries meaning; status and correctness are told by dot count, weight and wash, with the word always printed.

## Typography

**Reading and display font:** Source Serif 4 (fallback Iowan Old Style, Georgia).
**Apparatus font:** Source Sans 3 (fallback Segoe UI, system-ui).
**Code font:** Source Code Pro (fallback ui-monospace, Menlo).

The serif carries what a reviewer reads. The sans carries what they scan: nav, tables, captions, labels, forest-plot rows. Mono is for code, file paths, commit ids and run codes, and nothing else.

### Hierarchy
- **Headline** (700, clamp 32 to 46px, 1.1): the page title, balanced, at most 24ch.
- **Title** (700, 26px, 1.2): section headings, with 64px above and 14px below.
- **Subsection** (Source Sans 3 600, 19px): h3.
- **Body** (400, 17px, 1.62): running text across the full column width; the lede is 19px.
- **Label** (Source Sans 3 600, 15px): table headers, run-ins, forest-plot labels.
- **Caption** (Source Sans 3 400, 14.5px): figure and table captions, which lead with a bold "Figure n." or "Table n.".

### Named Rules
**The Mono-for-Identifiers Rule.** Commit ids, run codes (f14, f15) and file names are set in Source Code Pro. Prose identifiers get no background; only real code gets the code ground.

## Layout

- The content is at most 1240px wide, centred. Gutters are clamp(20px, 4vw, 56px).
- Reference pages have a 196px sticky "On this page" rail beside the reading column, 56px apart. The demo page drops the rail and runs full width.
- Text, tables, forest plots and figures all run the full column width (owner preference: no narrower text measure). Only the page title (24ch), Equation 1 (820px) and small lookup tables are capped.
- On the demo, the abstract sits beside Equation 1, then the recording sits beside its step table. Each pair stacks below 1180px.
- Below 960px the rail is hidden. Below 640px:
  - tables marked `stack` become one record per row, with a small label over each value;
  - forest plots become two-line rows that keep their axis;
  - the nav becomes a three-column grid.

## Elevation & Depth

The site is flat: no shadows, no glass, no layered surfaces. Hierarchy comes from rules, using a 1.5px ink rule at the top and bottom of every table and plot, a 1px ink rule under headers, and soft hairlines between rows. It also comes from the 3px plum masthead rule, type weight, and the plum wash on the one active row.

### Named Rules
**The Rules-Not-Boxes Rule.** Group content with horizontal rules and white space. A bordered, rounded or shadowed panel is not part of this world.

## Shapes

Corners are square. The only rounding is a 2px radius on inline code. The forest-plot estimate is a plum diamond, a 13px square rotated 45 degrees. Status dots are 9px circles, filled or outlined, with a dashed outline for "extra".

## Components

### Navigation
The masthead has the wordmark at the left, a "Research prototype. Not for clinical use." line under it, and five page links at the right. The current page is weight 600 with a 2px plum underline, and links show a hairline underline on hover. A 3px plum rule closes the masthead. The colophon repeats the not-for-clinical-use line on every page.

### Tables
These are booktabs tables:
- Ink rules at the top and bottom, and a 1px rule under the header row.
- Soft hairlines between rows, with no zebra striping and no vertical rules.
- Numbers are tabular and do not wrap.
- A wrong answer is bold Deep Plum on Plum Wash, explained in the caption.
- Each table has a caption above it.

### Forest plot (signature component)
Each row has three parts:
- the label, with a sub-line for calls or modes;
- the value, as "68% (34/50)" with the interval beside it;
- the plot, with a 40 to 100% axis and gridlines every 10 points, an ink interval bar with end caps, and the plum diamond at the estimate.

A dashed ink reference line marks the single-agent estimate wherever arms are compared. The caption names the interval method (Wilson 95%).

### Status mark
A status mark is four dots plus the word:
- matches: four filled;
- partial: two;
- differs: one;
- missing: none filled;
- extra: four dashed grey outlines.

Each table that uses the marks has a key above it.

### Equation
Equation 1 is the C and U mode rule, set as cases in the serif with a drawn SVG brace that spans the three cases. Mode names are in the sans, and the equation number "(1)" sits flush right, kept on mobile. Rules sit above and below it.

### Step list (demo)
The step list is a list of buttons, each a time and a label. Chapter rows are bold, with the time in plum. The step currently playing gets the plum wash, weight 600 and `aria-current="step"`. The list has no inner scroll.

## Do's and Don'ts

### Do:
- **Do** put the comparison a reviewer came for (arms with intervals) directly under the Bottom line.
- **Do** number every figure and table, and cite them from the prose.
- **Do** print the status word next to every status mark, and the count next to every percentage.
- **Do** state "Research prototype. Not for clinical use." in the masthead and the colophon of every page.

### Don't:
- **Don't** add cards, panels, shadows, rounded containers or a dark theme. The incumbent dark dashboard of rounded panels is the anti-reference.
- **Don't** add a second accent colour or encode meaning by hue alone.
- **Don't** use coloured side stripes (left or right borders over 1px, or inset shadows) to mark an active or current item.
- **Don't** set prose or headings in mono.
