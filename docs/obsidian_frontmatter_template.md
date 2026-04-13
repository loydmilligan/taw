# Obsidian Frontmatter System for a Personal Knowledge Wiki

## 🧠 Core Frontmatter Template (Best All-Purpose)

```yaml
---
title: 
aliases: []
type: 
tags: []
status: 
created: 
updated: 
source: 
author: 
related: []
---
```

---

## 🔍 What Each Field Is For (And Why It Matters)

### 1. title
- Optional (Obsidian uses filename), but useful for:
  - Clean exports
  - Syncing with tools like Dataview

---

### 2. aliases
```yaml
aliases: [AI, Artificial Intelligence]
```
- Helps with search + linking flexibility
- Great for concepts with multiple names

---

### 3. type ⭐ (VERY IMPORTANT)
```yaml
type: concept
```
Create a controlled set like:
- concept
- note
- project
- person
- book
- idea
- task

---

### 4. tags
```yaml
tags: [productivity, learning]
```
- Use for broad themes
- Avoid over-tagging (2–5 max per note)

---

### 5. status
```yaml
status: seed
```
Knowledge maturity:
- seed → raw idea
- growing → being developed
- evergreen → polished, permanent
- archived → no longer relevant

---

### 6. created & updated
```yaml
created: 2026-04-11
updated: 2026-04-11
```
- Enables time-based queries
- Useful for reviewing old notes

---

### 7. source
```yaml
source: "YouTube - XYZ video"
```
- Where the idea came from
- Helps with traceability

---

### 8. author
```yaml
author: "Naval Ravikant"
```
- Useful for quotes, book notes, ideas

---

### 9. related
```yaml
related: [Note A, Note B]
```
- Manual linking layer
- Complements backlinks

---

## ⚡ Optional Advanced Fields

### 🧩 Knowledge Graph
```yaml
parent: 
children: []
```

### 📚 Learning Notes
```yaml
difficulty: beginner
domain: psychology
```

### 🚀 Projects
```yaml
priority: high
due: 2026-05-01
```

### 💡 Ideas
```yaml
impact: high
effort: low
```

---

## 🛠️ Recommended Plugins

- Dataview → query notes like a database  
- Templater → auto-generate frontmatter  
- QuickAdd → fast note creation  

---

## 🧩 Example: Fully Built Note

```yaml
---
title: Second Brain Concept
aliases: [PKM, Personal Knowledge Management]
type: concept
tags: [productivity, thinking]
status: evergreen
created: 2026-04-11
updated: 2026-04-11
source: "Building a Second Brain"
author: "Tiago Forte"
related: [Zettelkasten, Note Taking Systems]
---
```

---

## 🔑 Final Advice

Frontmatter is not for decoration—it’s for querying and thinking.

Design it around:
- How you’ll search later  
- How you’ll connect ideas  
- How your system will scale  
