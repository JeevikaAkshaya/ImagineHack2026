const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { getDatabase, initDatabase } = require('./db');
const {
  generateMorningBriefing,
  rankClientPriorities,
  recommendCPD,
  generatePreMeetingBrief,
  askAdvianceQuestion,
  matchPartner
} = require('./claude');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Health computation helper
async function calculateAdvisorHealth(db) {
  const clients = await db.all('SELECT * FROM clients');
  const partners = await db.all('SELECT * FROM partners');
  const modules = await db.all('SELECT * FROM cpd_modules');

  // 1. Client Engagement: ratio of clients contacted in the last 30 days
  // Reference date: 2026-06-20
  const refDate = new Date('2026-06-20');
  let engagedCount = 0;
  clients.forEach(c => {
    if (c.last_contact_date) {
      const contactDate = new Date(c.last_contact_date);
      const diffTime = Math.abs(refDate - contactDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays <= 30) {
        engagedCount++;
      }
    }
  });
  
  const totalClients = clients.length || 1;
  const engagedScore = (engagedCount / totalClients) * 100;

  // 2. Learning Progress: completed CPD hours vs target (35 hours)
  const completedHoursResult = await db.get('SELECT SUM(hours) as sum FROM cpd_modules WHERE completed = 1');
  const completedHours = completedHoursResult.sum || 0;
  const targetHours = 35;
  const learningScore = Math.min((completedHours / targetHours) * 100, 100);

  // 3. Partner Activity: active partners (referral count > 0)
  const activePartners = partners.filter(p => p.recent_referral_count > 0).length;
  const totalPartners = partners.length || 1;
  const partnerScore = (activePartners / totalPartners) * 100;

  // Overall Health Score
  const healthScore = Math.round((engagedScore + learningScore + partnerScore) / 3);

  return {
    health_score: healthScore,
    client_engagement: Math.round(engagedScore),
    learning_progress: Math.round(learningScore),
    partner_activity: Math.round(partnerScore),
    engaged_count: engagedCount,
    total_clients: totalClients,
    completed_hours: completedHours,
    target_hours: targetHours,
    active_partners: activePartners,
    total_partners: totalPartners
  };
}

// Routes

// GET all clients
app.get('/api/clients', async (req, res) => {
  try {
    const db = await getDatabase();
    const clients = await db.all('SELECT * FROM clients');
    res.json(clients);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST new client
app.post('/api/clients', async (req, res) => {
  const { name, last_contact_date, portfolio_value, portfolio_performance_change, life_events, meeting_notes } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Client name is required.' });
  }

  try {
    const db = await getDatabase();
    const result = await db.run(
      `INSERT INTO clients (name, last_contact_date, portfolio_value, portfolio_performance_change, life_events, meeting_notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        name,
        last_contact_date || new Date().toISOString().split('T')[0],
        portfolio_value || 0,
        portfolio_performance_change || 0,
        life_events || '',
        meeting_notes || ''
      ]
    );

    const newClient = await db.get('SELECT * FROM clients WHERE id = ?', [result.lastID]);
    res.status(201).json(newClient);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Dashboard Stats
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const db = await getDatabase();
    
    // Meetings count today (2026-06-20)
    const meetings = await db.get("SELECT COUNT(*) as count FROM schedule WHERE date = '2026-06-20'");
    
    // Urgent follow-ups (pending)
    const followUps = await db.get("SELECT COUNT(*) as count FROM follow_ups WHERE status = 'pending'");
    
    // Calculate health score & metrics
    const health = await calculateAdvisorHealth(db);

    // Find "needs attention" clients (urgency high or med from Priorities engine)
    const clients = await db.all('SELECT * FROM clients');
    const priorities = await rankClientPriorities(clients);
    const attentionCount = priorities.filter(p => p.urgency === 'high' || p.urgency === 'med').length;

    res.json({
      meetings_count: meetings.count,
      followups_count: followUps.count,
      attention_count: attentionCount,
      health_score: health.health_score
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Dashboard Agenda (Meetings + Followups)
app.get('/api/dashboard/agenda', async (req, res) => {
  try {
    const db = await getDatabase();
    const schedule = await db.all(`
      SELECT s.*, c.name as client_name 
      FROM schedule s
      LEFT JOIN clients c ON s.client_id = c.id
      WHERE s.date = '2026-06-20'
    `);
    
    const followUps = await db.all(`
      SELECT f.*, c.name as client_name 
      FROM follow_ups f
      LEFT JOIN clients c ON f.client_id = c.id
    `);

    res.json({ schedule, followUps });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST mark follow up as complete
app.post('/api/follow-ups/:id/complete', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDatabase();
    await db.run("UPDATE follow_ups SET status = 'completed' WHERE id = ?", [id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Dashboard Briefing
app.get('/api/dashboard/briefing', async (req, res) => {
  try {
    const db = await getDatabase();
    const schedule = await db.all(`
      SELECT s.*, c.name as client_name 
      FROM schedule s 
      LEFT JOIN clients c ON s.client_id = c.id 
      WHERE s.date = '2026-06-20'
    `);
    const followUps = await db.all("SELECT * FROM follow_ups WHERE status = 'pending'");
    const clients = await db.all("SELECT * FROM clients");

    const briefingText = await generateMorningBriefing(schedule, followUps, clients);
    res.json({ briefing: briefingText });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Dashboard priorities
app.get('/api/dashboard/priorities', async (req, res) => {
  try {
    const db = await getDatabase();
    const clients = await db.all('SELECT * FROM clients');
    const priorities = await rankClientPriorities(clients);
    
    // Join priority intelligence back to complete client rows
    const merged = priorities.map(p => {
      const client = clients.find(c => c.id === p.id);
      return {
        ...client,
        urgency: p.urgency,
        reason: p.reason,
        score: p.score
      };
    });

    res.json(merged);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET CPD/Learning Recommendations
app.get('/api/learning/recommendations', async (req, res) => {
  try {
    const db = await getDatabase();
    const clients = await db.all('SELECT * FROM clients');
    const allModules = await db.all('SELECT * FROM cpd_modules');
    
    const recommendations = await recommendCPD(clients, allModules);
    
    // Calculate completed hours
    const healthStats = await calculateAdvisorHealth(db);

    res.json({
      recommendations,
      allModules,
      completed_hours: healthStats.completed_hours,
      target_hours: healthStats.target_hours
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Start/Complete CPD module (increment progress)
app.post('/api/learning/start', async (req, res) => {
  const { moduleId } = req.body;
  if (!moduleId) {
    return res.status(400).json({ error: 'moduleId is required.' });
  }

  try {
    const db = await getDatabase();
    await db.run('UPDATE cpd_modules SET completed = 1 WHERE id = ?', [moduleId]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Pre-meeting brief for client
app.get('/api/learning/pre-meeting-brief', async (req, res) => {
  const { clientId } = req.query;
  if (!clientId) {
    return res.status(400).json({ error: 'clientId query parameter is required.' });
  }

  try {
    const db = await getDatabase();
    const client = await db.get('SELECT * FROM clients WHERE id = ?', [clientId]);
    if (!client) {
      return res.status(404).json({ error: 'Client not found.' });
    }

    const brief = await generatePreMeetingBrief(client);
    res.json(brief);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Ask Adviance Question
app.post('/api/learning/ask', async (req, res) => {
  const { query } = req.body;
  if (!query) {
    return res.status(400).json({ error: 'Query string is required.' });
  }

  try {
    const db = await getDatabase();
    const clients = await db.all('SELECT * FROM clients');
    const answer = await askAdvianceQuestion(query, clients);
    res.json({ answer });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all partners
app.get('/api/partners', async (req, res) => {
  try {
    const db = await getDatabase();
    const partners = await db.all('SELECT * FROM partners');
    res.json(partners);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST find specialist partners (match)
app.post('/api/partners/match', async (req, res) => {
  const { clientNeed } = req.body;
  if (!clientNeed) {
    return res.status(400).json({ error: 'clientNeed description is required.' });
  }

  try {
    const db = await getDatabase();
    const clients = await db.all('SELECT * FROM clients');
    const partners = await db.all('SELECT * FROM partners');

    const matches = await matchPartner(clientNeed, clients, partners);
    res.json({ matches });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET Advisor Health/Growth Stats
app.get('/api/growth/stats', async (req, res) => {
  try {
    const db = await getDatabase();
    const health = await calculateAdvisorHealth(db);
    res.json(health);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initialize DB and start server
async function startup() {
  try {
    await initDatabase();
    console.log('Database initialized successfully.');
    
    app.listen(PORT, () => {
      console.log(`AdvisorOS Backend server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to initialize database and start server:', error.message);
    process.exit(1);
  }
}

startup();
