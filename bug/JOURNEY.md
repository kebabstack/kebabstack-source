# Flight log

Launch from a fictional rooftop in Zürich, fly through five moments in the history of the Internet Computer, then deliver cargo for five applications and services. Progress follows distance flown. Missing a token or a special never locks the next stage. After 4,400 metres, OpenSaaS dispatch keeps sending parcels for as long as the pilot can fly.

## The archive

| Entry | Distance | Event | Cargo |
| --- | ---: | --- | --- |
| Swiss launch deck | 0 m | October 2016. DFINITY was founded in Zug and later moved to Zürich. | Blueprint |
| Copper workshop | 200 m | 2019. The Copper release introduced developers to the Canister SDK and Motoko. | Code fragment |
| Sodium assembly | 500 m | September 2020. DFINITY presented the Network Nervous System at the Sodium event. | Ballot |
| Genesis relay | 900 m | 10 May 2021. The Internet Computer reached its public Genesis launch. | Genesis signal |
| Bitcoin crossing | 1,350 m | December 2022. DFINITY announced that the Bitcoin mainnet integration was complete. | Chain link |

The network timeline records the foundation and Genesis dates. DFINITY’s account of the metal milestones covers Copper and Sodium. Its December announcement concerns Bitcoin directly. The wider group of integrations is now called Chain Fusion. [Network history](https://internetcomputer.org/network/history/) · [Road to Mercury](https://medium.com/dfinity/the-internet-computer-road-to-mercury-mainnet-launch-c54c1712788b) · [Bitcoin mainnet announcement](https://medium.com/dfinity/btc-icp-mainnet-integration-complete-bringing-smart-contract-functionality-to-bitcoin-9bd81d4ce0ba) · [Chain Fusion documentation](https://docs.internetcomputer.org/concepts/chain-fusion/)

## The delivery run

These missions follow the pilot’s work order. Their numbering describes the route, independent of product release dates.

| Distance | Dispatch | Cargo | Special in flight |
| ---: | --- | --- | --- |
| 1,850 m | Pass through the Internet Identity checkpoint. | Access stamp | Key absorbs one hazard collision. |
| 2,400 m | Recover the cargo around OISY, a multichain wallet. | Wallet chip | Orb attracts nearby tokens for eight seconds. |
| 3,000 m | Carry an app sketch through Caffeine Labs’ workshop. | Prompt card | Cup adds speed and height. |
| 3,700 m | Assemble nodes in the Open Cloud engine room. | Node core | Gate adds lift, speed and 50 K simulated cycles. |
| 4,400 m | Deliver business applications to OpenSaaS dispatch. | App parcel | Canister stores one emergency bounce. |

Internet Identity documents passkey sign-in. OISY lists the supported networks for its wallet. Caffeine Labs describes how Caffeine builds apps from a conversation. Open Cloud documents node selection, engines and the OpenSaaS business suite. [Internet Identity](https://docs.internetcomputer.org/guides/authentication/internet-identity/) · [OISY](https://docs.oisy.com/using-oisy-wallet/faq) · [Caffeine Labs](https://help.caffeine.ai/hc/en-us/articles/46899814439700-How-Caffeine-Works) · [Cloud Engines](https://opencloud.org/platform) · [OpenSaaS](https://opencloud.org/)

## In the cockpit

Three different tokens in a chapter link that station once per flight. The HUD counts them. Canister, Chain Fusion and OISY stations briefly attract nearby tokens. Compiler, Caffeine and Cloud Engine stations vent blaster heat and add thrust. Governance and identity stations give an updraft. The separate large pickups and the fifth-coin FLOW bonus still work. The end screen reports completed relays.

Ordinary tokens change face and name with the route. The scoring engine counts each as one coin. Specials have their own shapes and alter the flight. In 3D each 200-metre chunk offers a special. In 2D a solar current takes that slot every fourth chunk, including the opening chunk. The game simulates the cargo, cycle counter and special effects. Gameplay requires no wallet transaction or app deployment.

Both flight modes in the combined game read the same route from `src/ecosystem.js`. Each entry supplies the landmark key, distance, chapter, displayed period, token name, glyph, colour, special pickup kind, and a sourced field note. The existing 3D and 2D physics modules apply the effects.
