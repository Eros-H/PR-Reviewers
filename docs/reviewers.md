# Review requests

The host runs `gh` without a shell. It reads workspace Git metadata and sends repository and reviewer identifiers to GitHub. No tokens are stored by the plugin. No model or browser automation participates. Selecting reviewers has no external effect until **Request review** is pressed. GitHub sends notifications when that button submits a request.

People and teams are fetched across all pages. The PR author is excluded; pending reviewers cannot be selected again. Teams unavailable to the authenticated account are reported separately. A request whose readback fails is reported as unverified: refresh and check GitHub before submitting again. Completed reviews are shown in Paseo's native PR panel, not among pending requests here.

Reviewer membership is checked using sets so list processing grows linearly with the number of entries. CLI failures use bounded diagnostic codes rather than raw command output.
