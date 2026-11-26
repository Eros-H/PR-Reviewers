# Paseo . PR Reviewers

An independently maintained Paseo plugin for requesting GitHub pull request reviews. Open **Reviewers** from a workspace's panel picker, alongside Paseo's PR panel. It shows the branch's pull request, the active GitHub account, and pending requests. Select people or teams and choose **Request review**. Success appears only after a separate GitHub read confirms the selection.

## Setup

Requires Paseo 0.16.1 through 0.17.x (daemon and client), Node.js, Git, and the GitHub CLI (`gh`) on the daemon host. Authenticate there with `gh auth login`. The plugin uses that host's active account, including any `GH_TOKEN` override; it does not use the account signed into your browser.

The account needs access to the repository and permission to request reviews. Fine-grained tokens need Pull requests read/write; listing collaborators can require additional repository access and listing teams can require organization access. GitHub remains the authority on eligible reviewers. Missing list permissions are shown in the panel.

Enable plugins in Paseo settings. From a checkout of the desired revision:

```sh
npm ci
paseo plugin install /absolute/path/to/paseo-pr-reviewers
```

The plugin supports github.com repositories. The current branch must have a pull request; `gh pr view` resolves it using the workspace's Git configuration. Draft and closed pull requests cannot receive requests through this panel. Refresh after branch, account, or remote changes.

## Development

```sh
npm ci
npm run typecheck
npm test
```

See [review behavior and data access](docs/reviewers.md) and [development and publication](docs/development.md).
