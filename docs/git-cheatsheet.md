
---

### 🚀 The Ultimate Git + Firebase Cheatsheet

#### 1. The "Inner Loop" (Saving Your Work)
Use these constantly while coding.
- **Check status:**  
  `git status` (See what files you’ve changed)
- **Stage changes:**  
  `git add .` (Prepare all changes for a commit)
- **Commit:**  
  `git commit -m "Describe what you did"`
- **View History:**  
  `git log --oneline -n 5` (See your last 5 commits)

#### 2. Branch Navigation & Syncing
- **Show current branch:**  
  `git branch --show-current`
- **List all local branches:**  
  `git branch` (The one with `*` is where you are)
- **Switch branch:**  
  `git switch <branch-name>`
- **Sync & Prune:**  
  `git fetch --prune` (Updates your list and removes "ghost" branches that were deleted on GitHub)

#### 3. Creating a New Branch
- **From current branch:**  
  `git switch -c new-branch`
- **From a specific branch (e.g., main):**  
  `git switch -c new-branch main`

#### 4. The Standard Workflow (Step-by-Step)
```bash
# 1. Start fresh
git switch main
git pull origin main

# 2. Create your feature/fix branch
git switch -c feature/my-new-task

# 3. THE WORK LOOP (Repeat as needed)
git status
git add . && git commit -m "Added the new login logic"

# 4. Upload to GitHub
git push origin feature/my-new-task
```

#### 5. Merging & Updating
**The "Clean" Way (Fast-Forward):**
```bash
git switch main
git pull origin main
git merge --ff-only feature/my-new-task
git push origin main
```

#### 6. Proactive Cleanup (Safety First)
Before deleting, check if it's safe:
- **List branches already merged into main:**  
  `git branch --merged main`

**Execute Cleanup:**
- **Local (Safe):** `git branch -d branch-name` (Fails if not merged)
- **Local (Force):** `git branch -D branch-name` (Use only to trash work)
- **Remote (GitHub):** `git push origin --delete branch-name`

#### 7. Firebase Project Management
- **Switch project:**  
  `firebase use prod` OR `firebase use dev`
- **Check active project:**  
  `firebase use`
- **Deploy:**  
  `npm run build`  
  `firebase deploy --only hosting`

---

### Quick Reference Table

| Action | Command | Why |
| :--- | :--- | :--- |
| **Check Status** | `git status` | "What have I changed?" |
| **Stage All** | `git add .` | Prepare changes to be saved |
| **Save** | `git commit -m "..."` | Permanently save changes to history |
| **Upload** | `git push origin <name>` | Put your local commits on GitHub |
| **Switch** | `git switch <name>` | Move between tasks |
| **Sync List** | `git fetch --prune` | Clears "ghost" branches from your list |
| **Safety Check** | `git branch --merged` | See what is 100% safe to delete |
| **Delete Local** | `git branch -d <name>` | **Safe:** Won't delete unmerged work |
| **Delete Remote**| `git push origin --delete <name>` | Cleans up the GitHub UI |
| **FB Switch** | `firebase use <alias>` | Changes the target (Dev vs Prod) |
| **FB Deploy** | `firebase deploy` | Deploys based on current `firebase use` |

**Pro Tip:** If you ever get stuck in a weird state, `git status` is always your first move. It usually tells you exactly how to get out of it!