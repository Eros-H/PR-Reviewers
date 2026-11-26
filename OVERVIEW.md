Request GitHub reviews from a Reviewers panel beside your workspace's pull request panel. See pending requests, filter people and teams, select reviewers, and explicitly send a review request. The panel verifies the result with GitHub before showing success.

Requires Paseo 0.16.1 through 0.17.x on the daemon and client, and Git with an authenticated GitHub CLI on the daemon host. Requests use the host's active GitHub account, which is displayed in the panel. The account needs repository access and permission to request reviews; listing people and teams may require additional repository or organization access.

Supports github.com and open pull requests that are ready for review. The workspace branch determines the pull request. Missing permissions and unverified results appear in the panel. Refresh after changing branches or accounts. Pending requests are separate from completed reviews.

The plugin reads workspace Git metadata and sends repository and reviewer identifiers to GitHub. GitHub notifies the selected reviewers when you submit. The plugin stores no credentials and uses no model or browser automation. Independently maintained; not an official Paseo product.
