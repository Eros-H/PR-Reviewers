# Development and publication

`index.client.tsx` registers the React Native workspace/explorer panel. `index.server.ts` resolves the workspace through Paseo and routes validated RPCs to the GitHub adapter. The SDK is pinned to 0.17.5 and type-checked against it; the declared range covers Paseo 0.16.1 up to, but not including, 0.18.0, so a daemon and client on different series both match.

Source publication, a tagged GitHub release, and Paseo registry approval are separate stages. Registry listing requires a screenshot of the working panel and review of a pinned source revision. This project is independently maintained and is not an official Paseo product.

## Panel layout

Reviewers is a workspace panel in the panel picker. Its content uses collapsible sections (**Reviewers**, **Request review**) styled like the sections of Paseo's pull request panel. Paseo has no plugin contribution point for adding a section to its own pull request panel (checked against SDK 0.17.5 and Paseo's main branch on 2026-11-26), so the reviewers stay in this panel until one exists.
