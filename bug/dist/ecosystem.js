// Both flight modes use this route. The radio chatter and cargo are arcade fiction.
// "key" selects the landmark, "token" names an ordinary coin and "pickup" selects a special.
const history = 'https://internetcomputer.org/network/history/';
const metalMilestones = 'https://medium.com/dfinity/the-internet-computer-road-to-mercury-mainnet-launch-c54c1712788b';

export const ZONES = [
  {
    at: 0, key: 'zurich', chapter: 'history', period: 'October 2016',
    name: 'Swiss launch deck', tag: 'Bring the first blueprint into orbit.',
    color: '#a9ffdd', sky: '#c4d9e3', glyph: '◇', token: 'Blueprint', pickup: 'canister',
    speaker: 'DISPATCH · ZÜRICH', message: 'The archive is open. Launch from our Zürich roof and follow the trail of blueprints.',
    fact: 'The DFINITY Foundation was established in Zug in October 2016 and later moved to Zürich. The rooftop launch is our fictional departure.',
    url: history,
  },
  {
    at: 200, key: 'motoko', chapter: 'history', period: '2019',
    name: 'Copper workshop', tag: 'Compile the flight plan.',
    color: '#cba5ff', sky: '#8b8dbd', glyph: '{}', token: 'Code fragment', pickup: 'compiler',
    speaker: 'WORKSHOP · COPPER', message: 'The flight plan is in pieces. Follow the code fragments and catch the compiler for a climb.',
    fact: 'At the Copper milestone in 2019, DFINITY introduced the Canister SDK and Motoko, a programming language for the Internet Computer.',
    url: metalMilestones,
  },
  {
    at: 500, key: 'nns', chapter: 'history', period: 'September 2020',
    name: 'Sodium assembly', tag: 'Carry a proposal through the assembly.',
    color: '#ff92c5', sky: '#211d40', glyph: '✳', token: 'Ballot', pickup: 'neuron',
    speaker: 'ASSEMBLY · SODIUM', message: 'The ballots are drifting. Follow their arc and catch a neuron for lift and 50 K simulated cycles.',
    fact: 'DFINITY presented the Network Nervous System at Sodium in September 2020. The NNS governs the Internet Computer through proposals.',
    url: metalMilestones,
  },
  {
    at: 900, key: 'mainnet', chapter: 'history', period: '10 May 2021',
    name: 'Genesis relay', tag: 'The network is live. Relay the signal.',
    color: '#91ffe0', sky: '#10122f', glyph: '∞', token: 'Genesis signal', pickup: 'canister',
    speaker: 'RELAY · GENESIS', message: 'We have a signal. Trace it across the relay and catch a canister to store one emergency bounce.',
    fact: 'The Internet Computer reached its public Genesis launch on 10 May 2021.',
    url: history,
  },
  {
    at: 1350, key: 'fusion', chapter: 'history', period: 'December 2022',
    name: 'Bitcoin crossing', tag: 'Take the first cross-chain route.',
    color: '#ffbe7b', sky: '#271432', glyph: '↔', token: 'Chain link', pickup: 'fusion',
    speaker: 'RELAY · CHAIN FUSION', message: 'The route branches toward Bitcoin. Fly the chain links and take the fusion gate for speed and lift.',
    fact: 'In December 2022, DFINITY announced direct integration with Bitcoin mainnet. Bitcoin was the first full network integration in what is now called Chain Fusion.',
    url: 'https://medium.com/dfinity/btc-icp-mainnet-integration-complete-bringing-smart-contract-functionality-to-bitcoin-9bd81d4ce0ba',
  },
  {
    at: 1850, key: 'identity', chapter: 'mission', period: 'Mission 01',
    name: 'Identity checkpoint', tag: 'Get the courier through the gate.',
    color: '#94ffcc', sky: '#08272e', glyph: '⌘', token: 'Access stamp', pickup: 'identity',
    speaker: 'CHECKPOINT · IDENTITY', message: 'Time for a live delivery. Trace the access stamps and take the key to shield your next hazard collision.',
    fact: 'Internet Identity lets people sign in to apps on the Internet Computer. A passkey is one supported way to authenticate.',
    url: 'https://docs.internetcomputer.org/guides/authentication/internet-identity/',
  },
  {
    at: 2400, key: 'oisy', chapter: 'mission', period: 'Mission 02',
    name: 'OISY orbit', tag: 'Gather the scattered cargo.',
    color: '#b7afff', sky: '#191334', glyph: '◎', token: 'Wallet chip', pickup: 'oisy',
    speaker: 'COURIER · OISY', message: 'Wallet chips are scattered across the lane. The OISY orb draws nearby tokens in for eight seconds.',
    fact: 'OISY is a multichain wallet. Its supported networks include Bitcoin, Ethereum and the Internet Computer.',
    url: 'https://docs.oisy.com/using-oisy-wallet/faq',
  },
  {
    at: 3000, key: 'caffeine', chapter: 'mission', period: 'Mission 03',
    name: 'Caffeine Labs', tag: 'Carry a sketch from prompt to app.',
    color: '#ffc581', sky: '#282039', glyph: '≈', token: 'Prompt card', pickup: 'coffee',
    speaker: 'WORKSHOP · CAFFEINE', message: 'Your prompt has a destination. Scoop up its cards and catch the coffee cup to gain height and speed.',
    fact: 'Caffeine Labs builds Caffeine. It lets people describe an app in conversation and uses AI to build it for the Internet Computer.',
    url: 'https://help.caffeine.ai/hc/en-us/articles/46899814439700-How-Caffeine-Works',
  },
  {
    at: 3700, key: 'engines', chapter: 'mission', period: 'Mission 04',
    name: 'Open Cloud engine room', tag: 'Assemble the nodes for delivery.',
    color: '#69e4ff', sky: '#091f34', glyph: '⬡', token: 'Node core', pickup: 'portal',
    speaker: 'ENGINE ROOM · OPEN CLOUD', message: 'Bring the node cores into formation. The engine gate adds lift, speed and 50 K simulated cycles.',
    fact: 'Open Cloud lets operators choose nodes for a Cloud Engine. Those nodes run an execution environment for applications in canisters.',
    url: 'https://opencloud.org/platform',
  },
  {
    at: 4400, key: 'canisters', chapter: 'mission', period: 'Mission 05',
    name: 'OpenSaaS dispatch', tag: 'Deliver the first parcel. Keep the route open.',
    color: '#63eeff', sky: '#0c2031', glyph: '▤', token: 'App parcel', pickup: 'canister',
    speaker: 'DISPATCH · OPENSAAS', message: 'Dispatch is open. Take the app parcels onward. A canister stores one bounce for the next low pass.',
    fact: 'Open Cloud presents OpenSaaS as a suite of business apps for Cloud Engines. Examples include Open Expenses, Open Projects and Open Calendar.',
    url: 'https://opencloud.org/',
  },
];

export const POWERUPS = {
  coffee: { name: 'Caffeine cup', effect: 'Gain speed and height', color: '#ffc581' },
  compiler: { name: 'Motoko compiler', effect: 'Slingshot forward and upward', color: '#cba5ff' },
  canister: { name: 'Canister capsule', effect: 'Store one emergency bounce', color: '#63eeff' },
  identity: { name: 'Identity key', effect: 'Block one hazard collision', color: '#94ffcc' },
  oisy: { name: 'OISY orb', effect: 'Attract nearby tokens for 8 seconds', color: '#b7afff' },
  fusion: { name: 'Chain Fusion gate', effect: 'Burst forward and climb', color: '#ffbe7b' },
  portal: { name: 'Cloud Engine gate', effect: 'Lift, speed and 50 K simulated cycles', color: '#69e4ff' },
  neuron: { name: 'NNS neuron', effect: 'Lift, speed and 50 K simulated cycles', color: '#ff92c5' },
};
