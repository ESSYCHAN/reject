import 'dotenv/config';
import { searchKnowledge } from '../services/vectordb.js';

async function test() {
  const results = await searchKnowledge('I feel stuck as a lawyer and want to change careers');
  
  console.log('Search results:\n');
  for (const hit of results) {
    console.log('Score:', hit._score);
    console.log('Fields:', hit.fields);
    console.log('---');
  }
}

test().catch(console.error);
