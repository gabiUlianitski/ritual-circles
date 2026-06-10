# Multi-agent personas (Ritual Circles)

Use these **named agents** when reasoning about product, UX, or UI in chat, design reviews, or planning. They are **empathy and quality lenses**, not separate codebases or autonomous services.

When a task touches users, visuals, or flows, explicitly consider **which agent’s concerns apply** and resolve conflicts using **Ritual Circles V1 rules** (see `.cursor/rules/ritual-circles-v1.mdc`). If a persona asks for something **out of V1 scope** (feeds, discovery, public “publish circle” listings, chat, matching algorithms), capture it as **future vision** or **research note**—do **not** implement it unless product scope changes.

---

## EndUser

**Who:** A **40-year-old** person who wants to find others to enjoy **hobbies** together. **No computer background**. They want to **join the app easily** and stay—any friction is a real drop-off risk.

**Goals**

- Find **opportunities** aligned with **similar hobbies** (in V1 terms: clear ritual/hobby choice, joining a small circle that fits what they care about).
- **Create or join a circle** of people they’d like to do those things with (V1: create circle + share invite, or join via invite—no global marketplace).

**How this agent “votes”**

- Prefers **short paths**, **plain language**, **one obvious next action**, and **forgiveness** (easy recovery from mistakes).
- **Does not** care about internal steps, technical jargon, or “power user” layouts.

**Escalation**

- Whenever something feels **hard, scary, or confusing**, EndUser **raises a flag** for **Designer** and **UIExpert**: document the friction (screen, step, exact words) and ask for a simpler path or clearer presentation—**without** expanding product scope unless leadership approves.

---

## Designer

**Who:** Owns **holistic design intent**: emotional tone, information hierarchy, and how the product feels as a **place for people who are lonely or isolated** and want **shared hobbies** with others—not a cold utility.

**Goals (intent)**

1. Help people **find circles** that fit **similar hobbies** (within V1: clarity of ritual type, onboarding, invite journey—not an open-ended discovery feed unless scope changes).
2. Support **creating a circle** and **reaching others** who might join (within V1: invite link, share, recurring session clarity—not public “publish to the world” unless scope changes).
3. Push for **warm, trustworthy** visuals and copy so the app feels **welcoming**, not clinical.

**Coordination & “smart” system**

- The product should feel **coordinated**: next meeting, who’s coming, reminders—**not** a social graph or engagement engine in V1.
- **Differentiate levels** (e.g. tennis beginner vs pro, chess junior vs master) where the **data model and copy** allow—aligned with **hobby metadata** (types/levels) when present; avoid over-promising features that require new tables or matching engines unless explicitly approved.

**Constraint**

- Designer proposals must be **filtered through V1**: calm, minimal, **Home-first**, **stack navigation** on mobile, **no feeds/tabs** as defined in project rules.

---

## UIExpert

**Who:** Ensures the **interface is usable** for **all levels** of computer and mobile literacy—comparable in **ease of learning** to mass-market apps people already know (e.g. familiar patterns where they don’t fight V1 simplicity).

**Responsibilities**

- Turn **Designer** intent into **implementable UI**: spacing, typography, touch targets, states (loading, empty, error), and **progressive disclosure** so beginners are not overwhelmed.
- **Web first** in current delivery, but patterns should **translate** to **Android** and **iOS** (responsive layout, platform-appropriate components later—same mental model: one hub, clear primary action).
- Work with **EndUser** flags: if EndUser would stall, **simplify or relabel** before adding screens or features.

**Constraint**

- “Facebook-easy” means **recognizable, forgiving patterns**, not Facebook-scale features (no infinite scroll, no social feed in V1).

---

## Working together

| Situation | Lead with |
|-----------|-----------|
| Copy, hierarchy, emotional tone | **Designer** (then **UIExpert** for execution) |
| Tap targets, forms, errors, responsive layout | **UIExpert** |
| “Would my non-technical friend get stuck?” | **EndUser** → flag **Designer** + **UIExpert** |
| “Should we build X?” | **V1 rules** first; agents inform **how** we build within scope |

---

## Quick reference

| Agent | Core question |
|-------|----------------|
| **EndUser** | Can someone with **no tech background** complete this in **one calm path**? |
| **Designer** | Does this feel **warm, clear, and dignified** for people seeking **shared hobbies**? |
| **UIExpert** | Is this **obvious, accessible, and mobile-ready** without extra complexity? |

When in doubt: **ship the smallest change** that satisfies **EndUser** clarity and **Designer** warmth inside **UIExpert**-friendly patterns—and **stay inside V1 scope**.
