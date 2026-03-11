import 'dotenv/config';
import { storeKnowledge } from '../services/vectordb.js';

const pivotStories = [
  {
    id: 'pivot-lawyer-to-ux',
    text: 'I was a corporate lawyer for 6 years making great money but feeling dead inside. The transition to UX design took 8 months. I did a bootcamp while working, built 3 portfolio projects, and got rejected 47 times before landing my first role. Key insight: my legal background in contracts actually helped me understand user agreements and privacy flows.',
    category: 'pivot-story',
    fromRole: 'lawyer',
    toRole: 'ux-designer',
    transitionMonths: 8
  },
  {
    id: 'pivot-teacher-to-pm',
    text: 'Former high school teacher who became a Product Manager. Teachers are natural PMs - we manage stakeholders (parents), ship products (lesson plans), and handle difficult users (teenagers). I got my first PM role by volunteering to manage an internal tool at a startup. 23 rejections, most said I had no tech experience.',
    category: 'pivot-story',
    fromRole: 'teacher',
    toRole: 'product-manager',
    transitionMonths: 6
  },
  {
    id: 'pivot-finance-to-data',
    text: 'Investment banker to Data Scientist. I already knew Excel and SQL from finance. Learned Python on nights and weekends for 4 months. The hardest part was convincing recruiters I was serious about the switch. What worked: I rebuilt my banking models in Python and showed the comparison.',
    category: 'pivot-story',
    fromRole: 'investment-banker',
    toRole: 'data-scientist',
    transitionMonths: 5
  },
  {
    id: 'rejection-pattern-ats',
    text: 'ATS rejections within 24 hours usually mean keyword mismatch. Your resume doesnt have the exact terms from the job posting. Fix: copy 5-10 key terms from the job description into your skills or experience sections naturally.',
    category: 'rejection-wisdom',
    stage: 'ats'
  },
  {
    id: 'rejection-pattern-ghost',
    text: 'Getting ghosted after final round is brutal but common. 40% of candidates report being ghosted after interviews. It usually means they went with an internal candidate or the role got frozen. Not your fault. Send one follow-up after a week, then move on.',
    category: 'rejection-wisdom',
    stage: 'final-round'
  }
];

async function seed() {
  console.log('Seeding Vector DB...');
  
  for (const story of pivotStories) {
    const { id, text, ...metadata } = story;
    //@ts-ignore
    await storeKnowledge(id, text, metadata);
    console.log(`Stored: ${id}`);
  }
  
  console.log('Done! Seeded', pivotStories.length, 'records');
}

seed().catch(console.error);
