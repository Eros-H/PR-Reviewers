# Review requests

The host runs `gh` without a shell. It reads workspace Git metadata and sends repository and reviewer identifiers to GitHub. The client loads avatars from `avatars.githubusercontent.com` by login and shows the initial when one fails. No tokens are stored by the plugin. No model or browser automation participates. Selecting reviewers has no external effect until **Request review** is pressed. GitHub sends notifications when that button submits a request.

People and teams are fetched across all pages. The PR author is excluded. The Reviewers list shows pending requests and each person's latest submitted review, read from `gh pr view --json latestReviews`, because GitHub removes a person from the requested reviewers once they submit a review. People listed there are not offered again as candidates; a person whose review is submitted and not pending gets **Re-request**, which sends a request for that person alone and verifies it like any other request. Teams unavailable to the authenticated account are reported separately. A request whose readback fails is reported as unverified: check GitHub before submitting again.

Reviewer membership is checked using sets so list processing grows linearly with the number of entries. CLI failures use bounded diagnostic codes rather than raw command output.

## Updates

The panel reads GitHub in two parts. Review state (pull request, review decision, account, requested reviewers, latest reviews) is polled every 30 seconds while the panel is shown, on window focus, and after a request; Paseo polls running pull request checks every 15 seconds, and reviews change less often. People and teams are read when the panel opens and again on focus once five minutes old, since they rarely change. Both are read again when Paseo reports a new branch for the workspace, which also clears the selection, because the branch decides the pull request. A request the server refuses because the pull request or account changed triggers an immediate status read.
