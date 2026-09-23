import {createDogfight} from '../dogfight.js';
import {GRAVITY} from './flight-tuning.js';
import {ghostPatrolAt} from './course.js';
export {ghostPatrolAt};
export const {newGhost,ghostTarget,hitGhost,stepGhostShots,stepGhost}=createDogfight({patrol:ghostPatrolAt,flat:true,gravity:GRAVITY});
