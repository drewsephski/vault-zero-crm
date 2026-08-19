# Changelog

## [1.1.0](https://github.com/drewsephski/vault-zero-crm/compare/v1.0.0...v1.1.0) (2026-08-19)


### Features

* **agent:** write deterministic acquisition dossiers ([3aee0ff](https://github.com/drewsephski/vault-zero-crm/commit/3aee0ffa033fdb9537825a7a95a801d088a8d390))
* **api:** add durable acquisition target promotion ([76392e8](https://github.com/drewsephski/vault-zero-crm/commit/76392e828dee4e51f85eda57313c5d86f271f71a))
* **api:** enhance email domain handling with machine address detection ([70d7e84](https://github.com/drewsephski/vault-zero-crm/commit/70d7e84b6532a45fae8cdf98e73aa3f19ff39fbb))
* **api:** enhance onboarding and research key handling ([f1d1332](https://github.com/drewsephski/vault-zero-crm/commit/f1d133213042573672fc0a1d819290221eb686a1))
* **api:** expose acquisition research state ([5da14c1](https://github.com/drewsephski/vault-zero-crm/commit/5da14c14cdc5fe94b38562734ce64ecedd94c1b1))
* **api:** implement Context.dev key verification and enhance capabil… ([d42a04e](https://github.com/drewsephski/vault-zero-crm/commit/d42a04ec0d2a3d1d35839e8958ad01e12e8f0de0))
* **api:** implement Context.dev key verification and enhance capabilities handling ([5ca4eae](https://github.com/drewsephski/vault-zero-crm/commit/5ca4eae9871615bfbffededaceeca2a9e4598348))
* **api:** implement delete functionality for companies, contacts, an… ([96bf31b](https://github.com/drewsephski/vault-zero-crm/commit/96bf31b72d0c8d8931d124e8670e2fc02601f830))
* **api:** implement delete functionality for companies, contacts, and deals ([4457f73](https://github.com/drewsephski/vault-zero-crm/commit/4457f7348a222ef32d34dedb74c75202c50a01a1))
* **app:** add dashboard and overview components for enhanced user experience ([181bd28](https://github.com/drewsephski/vault-zero-crm/commit/181bd28b016c1abacaeec3cf3581e76011af6152))
* **app:** make acquisition dossiers decision-first ([ec51b05](https://github.com/drewsephski/vault-zero-crm/commit/ec51b059bab3ba9ff6ab6ceca84cb696df58e026))
* **auth:** give every signed-up user their own workspace ([#4](https://github.com/drewsephski/vault-zero-crm/issues/4)) ([81c6e31](https://github.com/drewsephski/vault-zero-crm/commit/81c6e3144e5e2e90a361cb6b58cb13f55273ba15))
* **brand-mapping:** introduce fillable function and enhance brand update logic ([aad5945](https://github.com/drewsephski/vault-zero-crm/commit/aad59457baca4d99fcb0e693e86623c593fccae7))
* **db:** enforce acquisition target invariants ([7705515](https://github.com/drewsephski/vault-zero-crm/commit/77055155fda7aec18e7db414c444b2c011816a85))
* **landing:** enhance agent section and footer for improved layout and user engagement ([ad4ceaa](https://github.com/drewsephski/vault-zero-crm/commit/ad4ceaa9abec8eb5a829a2c6d8553614441e3519))
* **proxy:** implement marketing flag for landing page visibility ([81a36d6](https://github.com/drewsephski/vault-zero-crm/commit/81a36d66da79564a01a68af43c8639bfd676bdfd))
* **seo-audit:** add SEO audit skill and related resources ([f266040](https://github.com/drewsephski/vault-zero-crm/commit/f266040348e91c689170be5d459fe8a9dbf5df64))
* **turbo:** update test dependencies and document workspace behavior ([6d2e6e4](https://github.com/drewsephski/vault-zero-crm/commit/6d2e6e445c0618fb73f30f161767f52b647064b3))


### Fixes

* **acquisition:** align dossier evidence contracts ([fe87fec](https://github.com/drewsephski/vault-zero-crm/commit/fe87fecd789a67a95267bf7c43d543a301ff2d0f))
* **acquisition:** enforce target evidence boundaries ([38122fe](https://github.com/drewsephski/vault-zero-crm/commit/38122fe93281fd69e4c249d8b6ae924c9ee3e1e5))
* **acquisition:** make manual target creation idempotent ([0d7e12b](https://github.com/drewsephski/vault-zero-crm/commit/0d7e12be07971de4a0ad8319689a829093e0de10))
* **acquisition:** preserve target lifecycle truth ([07a1d67](https://github.com/drewsephski/vault-zero-crm/commit/07a1d6791ce8063501938c6ab600e5758f153840))
* **agent:** make acquisition task state durable ([3bd1e59](https://github.com/drewsephski/vault-zero-crm/commit/3bd1e593b6d9b75aff2dd50aa07bd6dd2c6c0618))
* **agent:** make task producers race-safe ([133b80f](https://github.com/drewsephski/vault-zero-crm/commit/133b80f5f53a84a77d0195560b9b87b454bb749b))
* **agent:** require dossier activity author ([0706c4c](https://github.com/drewsephski/vault-zero-crm/commit/0706c4c944b847793ff379b27d53a949edc3b0ed))
* **api:** deploy bundled vercel handler ([862e793](https://github.com/drewsephski/vault-zero-crm/commit/862e7938ec1c6fd6517bea998e16a9ab0130dcf0))
* **api:** derive acquisition views from targets ([cd42f7d](https://github.com/drewsephski/vault-zero-crm/commit/cd42f7db9a46b09c001b035a7df2fdd64db6ed30))
* **api:** preserve vercel function entrypoint ([4ae1246](https://github.com/drewsephski/vault-zero-crm/commit/4ae124617806ba42f822c2f07183ea4043a23d76))
* **api:** run bundled handler build in vercel ([1034407](https://github.com/drewsephski/vault-zero-crm/commit/103440787bbb15008a5cbfccf14e7640ec12c088))
* **api:** scope acquisition activity to targets ([7509322](https://github.com/drewsephski/vault-zero-crm/commit/7509322aea4e7b8c3fae14a63742d867ab02a80c))
* **api:** use generated function in vercel build ([d6e55a5](https://github.com/drewsephski/vault-zero-crm/commit/d6e55a5a551f7522e68f4745aa43ad5bc027adb8))
* **api:** wait for migration lock ([da33221](https://github.com/drewsephski/vault-zero-crm/commit/da3322125aa6db38067de12f91e3532c6b493e8f))
* **app:** generate route types before type checking ([03d4069](https://github.com/drewsephski/vault-zero-crm/commit/03d406976cc0a15601b53516a3041c27606489ed))
* **app:** harden acquisition target experience ([8f9ae1c](https://github.com/drewsephski/vault-zero-crm/commit/8f9ae1c66c3f03b70b9a282752b55b0b61453803))
* **app:** label acquisition profile tools ([75e9df4](https://github.com/drewsephski/vault-zero-crm/commit/75e9df48e91901fee546bcb7cc197f8366624191))
* **app:** stabilize workspace labels during hydration ([f5509df](https://github.com/drewsephski/vault-zero-crm/commit/f5509dfa5443e7733051dbafc38497e4815146f5))
* **db:** stabilize acquisition task migration ([4252d15](https://github.com/drewsephski/vault-zero-crm/commit/4252d157d5368aed1ec43c79041882987e19af25))
* **proxy:** refine redirect logic for sign-in path ([73875f0](https://github.com/drewsephski/vault-zero-crm/commit/73875f0cc22852a035a4f832beb3ced6d111decd))
* **proxy:** update redirect logic for signed-out users ([8871e49](https://github.com/drewsephski/vault-zero-crm/commit/8871e49d153db694933537a6ac28219d7761478b))
* **ui:** preserve scrollable tab presentation ([e234cd9](https://github.com/drewsephski/vault-zero-crm/commit/e234cd92603c88c0c225168cfcf9acac31e3f434))


### Refactors

* **agent:** centralize task queue persistence ([b272b11](https://github.com/drewsephski/vault-zero-crm/commit/b272b11659860e4537d9cd13de9e1a9a7e18e106))
* **api:** enhance deletion logic and activity stamp handling ([68f6014](https://github.com/drewsephski/vault-zero-crm/commit/68f6014eeb68b3fe863fd81e7cb266e2a309d4d0))
* **api:** improve email normalization and enhance record deletion handling ([277afef](https://github.com/drewsephski/vault-zero-crm/commit/277afef311bd0aa3f48443046052d588c912d673))
* **api:** update record deletion tests and enhance agent task handling ([82694a6](https://github.com/drewsephski/vault-zero-crm/commit/82694a6c4a3b9774e672207e9ca9f413c96dd9fe))
* **landing:** remove unused Link imports from agent and capabili… ([e2a5a7f](https://github.com/drewsephski/vault-zero-crm/commit/e2a5a7fc8dd42bdb210e4b1ea851ebde46195392))
* **landing:** remove unused Link imports from agent and capabilities sections ([66213dd](https://github.com/drewsephski/vault-zero-crm/commit/66213dd2dec88954a831771ccb087f78ce7d7e20))
* **landing:** replace Link components with divs for improved layout consistency ([79749f5](https://github.com/drewsephski/vault-zero-crm/commit/79749f5e0f760a7d8ceacac6a02e5c30e1d9d2e1))
* **proxy:** streamline onboarding and research gate handling ([a189eab](https://github.com/drewsephski/vault-zero-crm/commit/a189eab99a74e574ca95df8648d58c9109bad0e1))
* **proxy:** streamline onboarding and research gate handling ([14cb932](https://github.com/drewsephski/vault-zero-crm/commit/14cb93285600164f61834126098ad7d507141f82))


### Documentation

* **env:** document landing page behavior based on IS_MARKETING flag ([bde4fd5](https://github.com/drewsephski/vault-zero-crm/commit/bde4fd55aeb848f3fb7b4ee207f12c5bf37c7866))
* **env:** update .env.example and api.md to clarify marketing flag usage ([34900ae](https://github.com/drewsephski/vault-zero-crm/commit/34900ae78faa490f0bbe6fc8d9a2fc742f7dd959))
* plan Sam-ready acquisition release ([8a62ca9](https://github.com/drewsephski/vault-zero-crm/commit/8a62ca9fe41f1020e98c1606433a1cb5d44ed4ea))
* **README:** add stars badge for project visibility ([4dd7e90](https://github.com/drewsephski/vault-zero-crm/commit/4dd7e90632d98911c5a4531848ef6bdf9626eb19))
* **README:** align images for better presentation in the README ([a075794](https://github.com/drewsephski/vault-zero-crm/commit/a075794975b2beef2cdab16cf11e38b5d0bd3423))
* **README:** remove duplicate stars badge and improve project visibility ([96173a1](https://github.com/drewsephski/vault-zero-crm/commit/96173a1ebb6f37167cac443a4f508ef7f15433cb))
* **README:** update stars badge positioning for improved visibility ([b48268e](https://github.com/drewsephski/vault-zero-crm/commit/b48268e18cf93686006a7d57ee31918fb41c8ecb))

## 1.0.0 (2026-08-03)


### Features

* **brand-mapping:** introduce fillable function and enhance brand update logic ([aad5945](https://github.com/drewsephski/vault-zero-crm/commit/aad59457baca4d99fcb0e693e86623c593fccae7))
