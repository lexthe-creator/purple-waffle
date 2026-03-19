# Contributing

## Development Workflow

### 1. Create a feature branch

```bash
git checkout -b dev
```

Use a descriptive branch name for your feature or fix (e.g., `dev`, `feature/my-feature`, `fix/bug-name`).

### 2. Make changes, stage, and commit

```bash
git add .
git commit -m "describe what you changed"
```

Write clear, concise commit messages that describe *what* changed and *why*.

### 3. Merge back to main and push

```bash
git checkout main
git merge dev
git push origin main
```

Before merging, make sure your branch is up to date with `main`:

```bash
git fetch origin
git rebase origin/main
```

## Local Development

Install dependencies:

```bash
npm install
```

Start the dev server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```
