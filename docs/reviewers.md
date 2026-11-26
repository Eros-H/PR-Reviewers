# Review requests

The host runs `gh` without a shell. It reads workspace Git metadata and sends repository and reviewer identifiers to GitHub. No tokens are stored by the plugin. No model or browser automation participates. Selecting reviewers has no external effect until **Request review** is pressed. GitHub sends notifications when that button submits a request.

People and teams are fetched across all pages. The PR author is excluded. The Reviewers list shows pending requests and each person's latest submitted review, read from `gh pr view --json latestReviews`, because GitHub removes a person from the requested reviewers once they submit a review. People listed there are not offered again as candidates; a person whose review is submitted and not pending gets **Re-request**, which sends a request for that person alone and verifies it like any other request. Teams unavailable to the authenticated account are reported separately. A request whose readback fails is reported as unverified: refresh and check GitHub before submitting again.

Reviewer membership is checked using sets so list processing grows linearly with the number of entries. CLI failures use bounded diagnostic codes rather than raw command output.
