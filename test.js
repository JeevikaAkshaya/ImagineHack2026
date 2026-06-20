const assert = require('assert');
const { getDatabase, initDatabase } = require('./db');
const {
  generateMorningBriefing,
  rankClientPriorities,
  recommendCPD,
  generatePreMeetingBrief,
  askAdvianceQuestion,
  matchPartner
} = require('./claude');

async function runTests() {
  console.log('Running automated backend tests...');

  try {
    // 1. Database Connection and Schema verification
    console.log('Test 1: Initializing Database...');
    await initDatabase();
    const db = await getDatabase();
    
    const clients = await db.all('SELECT * FROM clients');
    assert.ok(clients.length >= 4, 'Should have seeded at least 4 clients');
    console.log(`✓ Database initialized. Found ${clients.length} clients.`);

    // 2. Schedule and follow-ups verification
    console.log('Test 2: Verifying schedule and follow-ups...');
    const schedule = await db.all('SELECT * FROM schedule');
    const followUps = await db.all('SELECT * FROM follow_ups');
    assert.ok(schedule.length > 0, 'Should have seeded schedule items');
    assert.ok(followUps.length > 0, 'Should have seeded follow-up items');
    console.log(`✓ Found ${schedule.length} meetings and ${followUps.length} follow-up tasks.`);

    // 3. Claude morning briefing generation
    console.log('Test 3: Generating Morning Briefing summary (Fallback/Claude)...');
    const briefingText = await generateMorningBriefing(schedule, followUps, clients);
    assert.ok(typeof briefingText === 'string' && briefingText.length > 10, 'Morning briefing should return a non-empty string');
    console.log('✓ Briefing content generated successfully:');
    console.log(`  "${briefingText}"`);

    // 4. Client Priority Urgency Engine
    console.log('Test 4: Evaluating Contextual Urgency Engine...');
    const priorities = await rankClientPriorities(clients);
    assert.ok(Array.isArray(priorities), 'Priorities should return an array');
    assert.strictEqual(priorities.length, clients.length, 'Should rank all clients');
    assert.ok(priorities[0].score >= priorities[priorities.length - 1].score, 'Priorities should be sorted descending by urgency score');
    
    const highUrgency = priorities.find(p => p.name === 'David Lim');
    assert.strictEqual(highUrgency.urgency, 'high', 'David Lim should be marked high urgency due to volatility anxiety');
    console.log('✓ Priority Urgency list computed correctly:');
    priorities.forEach(p => {
      console.log(`  - ${p.name}: Urgency = ${p.urgency.toUpperCase()} (Score: ${p.score}) - "${p.reason}"`);
    });

    // 5. Portfolio-Driven CPD recommendation
    console.log('Test 5: Identifying Skill Deficits (CPD)...');
    const cpdModules = await db.all('SELECT * FROM cpd_modules');
    const cpdRecs = await recommendCPD(clients, cpdModules);
    assert.ok(Array.isArray(cpdRecs), 'CPD recommendations should return an array');
    assert.ok(cpdRecs.length > 0, 'Should recommend at least one course');
    console.log('✓ CPD Course recommendations generated successfully:');
    cpdRecs.forEach(r => {
      const module = cpdModules.find(m => m.id === r.cpd_id);
      console.log(`  - Recommended Course: "${module ? module.title : 'Unknown'}" (Urgency: ${r.urgency.toUpperCase()})`);
      console.log(`    Justification: "${r.justification}"`);
    });

    // 6. Pre-meeting brief intelligence
    console.log('Test 6: Fetching Pre-Meeting Briefing...');
    const david = clients.find(c => c.name === 'David Lim');
    const brief = await generatePreMeetingBrief(david);
    assert.strictEqual(brief.client_name, 'David Lim', 'Brief client name should match');
    assert.strictEqual(brief.talking_points.length, 3, 'Should generate exactly 3 talking points');
    console.log('✓ Pre-meeting briefing generated with 3 customized talking points.');

    // 7. Specialist Partner Finder Matcher
    console.log('Test 7: Cross-matching Specialist Partners...');
    const partners = await db.all('SELECT * FROM partners');
    const matches = await matchPartner('Ahmad needs a lawyer for business succession', clients, partners);
    assert.ok(Array.isArray(matches), 'Matches should return an array');
    assert.ok(matches.length > 0, 'Should return at least one matched partner');
    
    const faridMatch = matches.find(m => m.name.includes('Farid'));
    assert.ok(faridMatch, 'Farid Hassan should be matched for business succession legal needs');
    assert.ok(faridMatch.draft_email.includes('Farid'), 'Draft email should address the partner');
    console.log('✓ Specialist partner matched and outreach email drafted:');
    console.log(`  - Matched: ${faridMatch.name} (${faridMatch.specialty})`);
    console.log(`  - Compatibility: ${faridMatch.compatibility.toUpperCase()}`);
    console.log(`  - Reason: "${faridMatch.reason}"`);

    console.log('\nAll automated backend tests PASSED successfully! 🎉');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test execution FAILED:', error);
    process.exit(1);
  }
}

runTests();
