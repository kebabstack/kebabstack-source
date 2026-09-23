import {createDogfight} from './dogfight.js';
export const ghostPatrolAt=d=>d>=500&&(d<1600||(d>=2200&&(d-2200)%1800<1100));
export const {newGhost,ghostTarget,hitGhost,stepGhostShots,stepGhost}=createDogfight({patrol:ghostPatrolAt});
