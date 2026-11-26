# Development and publication

`index.client.tsx` registers the React Native workspace/explorer panel. `index.server.ts` resolves the workspace through Paseo and routes validated RPCs to the GitHub adapter. The SDK is pinned to 0.17.5 and type-checked against it; the declared range covers Paseo 0.16.1 up to, but not including, 0.18.0, so a daemon and client on different series both match.

Source publication, a tagged GitHub release, and Paseo registry approval are separate stages. Registry listing requires a screenshot of the working panel and review of a pinned source revision. This project is independently maintained and is not an official Paseo product.
