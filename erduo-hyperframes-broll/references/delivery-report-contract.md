# Delivery report contract

`delivery-report.mjs` converts verified delivery summary data into the only user-facing completion report. It reports exactly: master location, shot directory and count, total duration, actual asset route categories, passed verification gates, and a closed vocabulary of real limitations. It requires all five pre-delivery gates, so an incomplete verification run cannot be reported as delivered.

The summary rejects unknown fields, state/hash/error objects, credentials, source traversal paths, raw subtitles, unverifiable route names and unsupported compatibility claims. It may show the user-facing master and shots output locations; it never accepts source-media or internal cache/state locations. Known unverified facts use explicit wording: no Pexels Key test, Windows, and 剪映专业版桌面端.
