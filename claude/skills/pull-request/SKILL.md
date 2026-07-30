---
name: pull-request
description: How to run a pull request to the point where it can be merged — resolving every review conversation, checking every workflow run rather than the summary, and confirming the merge result is what CI actually tested. Load this whenever you open, update, review, or merge a PR, whenever a review round returns findings, and before saying a branch is "green" or merging anything.
---

# Pull requests — nothing is left dangling

A PR is finished when every question raised on it has an answer and every check that gates it has
actually run. Both halves get skipped in the same way: by reading a summary instead of the thing
itself.

## The rule: never leave a review conversation open

**Every review thread on a PR must be resolved before merge — no exceptions, including threads you
disagree with and threads that have become obsolete.** An open thread is an unanswered question, and
a merged PR with open threads tells the next reader that nobody decided.

Resolving does not mean agreeing. There are exactly three honest outcomes, and each needs a reply
*before* the thread is resolved:

| Outcome | Reply must say |
|---|---|
| Fixed | which commit, and what now enforces it (the symbol, not the intention) |
| Won't fix | why, specifically — cost, scope, or a rule that outranks it — not "by design" |
| Obsolete | why it no longer applies, e.g. the code it names was deleted |

Resolving silently is the failure mode to avoid: it looks identical to fixing it, and the reviewer
cannot tell which happened.

Check for threads with the API — the PR page summary and `gh pr view` do **not** list unresolved
threads, so a PR can look clean while carrying several:

    gh api graphql -f query='
    { repository(owner:"OWNER", name:"REPO") {
        pullRequest(number:NN) {
          reviewThreads(last:60) { nodes { id isResolved isOutdated path
            comments(last:1){nodes{author{login} body}} } }
        } } }' --jq '.data.repository.pullRequest.reviewThreads.nodes[]
                     | select(.isResolved==false) | "\(.path) | \(.comments.nodes[0].body[0:160])"'

Reply, then resolve:

    gh api graphql -f query='mutation { addPullRequestReviewThreadReply(
      input:{pullRequestReviewThreadId:"THREAD_ID", body:"..."}) { clientMutationId } }'
    gh api graphql -f query='mutation { resolveReviewThread(
      input:{threadId:"THREAD_ID"}) { thread { isResolved } } }'

Bot reviewers (Copilot and similar) count. Their findings go stale as the branch moves — a thread
about a method you have since deleted still needs the one-line reply saying so.

## "Green" means every workflow run, on the commit that will land

`gh pr checks` reports the *checks* wired to the PR, which is often a subset — a repo can run CI
Build, CodeQL and Dependency Review as workflow runs while `gh pr checks` shows only one. Enumerate
runs by commit SHA instead:

    gh run list --branch BRANCH --limit 20 --json name,headSha,status,conclusion \
      --jq '.[] | select(.headSha|startswith("SHA")) | "\(.name) | \(.status) | \(.conclusion)"'

Then, before merging, three things that are each easy to skip:

1. **The runs must be on the head commit**, not an older one. A push cancels in-flight runs; a
   `cancelled` CI Build on the previous SHA is not a pass on this one.
2. **Is the merge result what CI tested?** If `main` has moved, CI built the branch, not the merge.
   `git merge-base --is-ancestor origin/main HEAD` — true means fast-forward and the result applies
   exactly; false means the merge produces a tree nobody has built, so update the branch first.
3. **Check main after merging too.** A green PR does not guarantee a green main, and a broken main
   blocks everyone.

## Do not merge without explicit approval

Merging is outward-facing and hard to reverse. Get the owner's approval **per merge** — approval to
merge one PR is not approval for the next. When approval is given as a judgement call ("merge it if
you think it's safe"), that is real approval; do the due diligence above and say what you checked,
not just that it passed.

Match the repo's existing merge style — read `git log --oneline` on the base branch. If past PRs are
single commits titled `... (#NN)`, squash; if the history keeps merge commits, do that instead.

## Writing the PR itself

Public artifacts are facts-only: the problem, what changed, results, tests. Never internal plan or
ticket paths, internal programme or sprint names, persona/role names, agent or model names, or
internal discussion. No AI attribution in commits or PR bodies.

A description that says what the change *does* is less useful than one that says what was **wrong**
and what now prevents it. When a review round finds defects, post the resolution as a comment —
which findings were confirmed, which were refuted and why, and what was verified — so the reasoning
survives past the diff.

## Related

`/review-tier` decides how much review to buy and how to scope a follow-up round. `/verify-landed`
proves a fix exists and does something before you claim it in a thread reply.
