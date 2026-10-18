import {test} from 'node:test';
import assert from 'node:assert/strict';
import {displayError} from '../dist/view.js';
test('provider errors never expose serialized request credentials',()=>{const raw='The replica returned a rejection error: Canister exceeded the limit of 5000000000 instructions. RequestDetails { arg: SECRET_SESSION_TOKEN }';const message=displayError(new Error(raw));assert.match(message,/shorter date range/);assert.doesNotMatch(message,/SECRET|replica|5000000000/);assert.doesNotMatch(displayError(new Error('HTTP details: SECRET_SESSION_TOKEN')),/SECRET/);assert.equal(displayError(new Error('Choose a valid date range.')),'Choose a valid date range.');});
