const { Anthropic } = require('@anthropic-ai/sdk');
require('dotenv').config();

const apiKey = process.env.ANTHROPIC_API_KEY;
let anthropic = null;

if (apiKey && apiKey.trim() !== '') {
  try {
    anthropic = new Anthropic({ apiKey });
    console.log('Anthropic Claude API client initialized successfully.');
  } catch (error) {
    console.error('Error initializing Anthropic client:', error.message);
  }
} else {
  console.log('No ANTHROPIC_API_KEY found in environment variables. Falling back to local reasoning mockup.');
}

// 1. Morning Briefing Generator
async function generateMorningBriefing(schedule, followUps, clients) {
  if (anthropic) {
    try {
      const scheduleSummary = schedule.map(s => `- ${s.time}: ${s.title} (${s.client_name || 'No client'})`).join('\n');
      const followUpSummary = followUps.map(f => `- ${f.description} (status: ${f.status}, due: ${f.due_date})`).join('\n');
      const clientSummary = clients.map(c => `- ${c.name}: last contact ${c.last_contact_date}, portfolio change ${c.portfolio_performance_change * 100}%, notes: ${c.meeting_notes}`).join('\n');

      const systemPrompt = `You are a warm, professional, and concise AI chief of staff for a Malaysian financial advisor. 
Your task is to synthesize the advisor's agenda, tasks, and client list into a short, natural-language morning briefing (max 3-4 sentences).
Highlight the most urgent priorities (e.g., overdue tasks, anxious clients, or portfolio drops) first. 
Keep it encouraging, and write in the second person ("You have...", "David needs..."). 
Do not include any greeting or conversational filler like "Here is your briefing". Just return the text.`;

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Schedule:\n${scheduleSummary}\n\nFollow-ups:\n${followUpSummary}\n\nClients:\n${clientSummary}`
        }]
      });

      return response.content[0].text.trim();
    } catch (error) {
      console.error('Claude API Error (Morning Briefing):', error.message);
      // Fallback to mock if API call fails
    }
  }

  // Smart Local Fallback
  const urgentClients = clients.filter(c => 
    c.meeting_notes.toLowerCase().includes('anxious') || 
    c.meeting_notes.toLowerCase().includes('volatility') || 
    c.portfolio_performance_change <= -0.05
  );
  
  const overdueTasks = followUps.filter(f => f.status === 'pending');
  const meetingsCount = schedule.length;

  let briefingText = `You have ${meetingsCount} meeting${meetingsCount === 1 ? '' : 's'} scheduled for today and ${overdueTasks.length} pending follow-up${overdueTasks.length === 1 ? '' : 's'}. `;

  if (urgentClients.length > 0) {
    const primary = urgentClients[0];
    briefingText += `**${primary.name}** requires priority attention today — recent notes indicate they are feeling ${primary.meeting_notes.toLowerCase().includes('anxious') ? 'anxious' : 'concerned'} about portfolio fluctuations. `;
  } else if (clients.length > 0) {
    briefingText += `Your client base is stable. **${clients[0].name}** was last contacted on ${clients[0].last_contact_date} and is in good standing. `;
  }

  if (overdueTasks.length > 0) {
    briefingText += `Be sure to address the overdue task: "${overdueTasks[0].description}" as soon as possible.`;
  } else {
    briefingText += `All your follow-ups are currently on track. Have a productive day!`;
  }

  return briefingText;
}

// 2. Client Priority Ranking (Contextual Urgency Engine)
async function rankClientPriorities(clients, meetingNotes) {
  if (anthropic) {
    try {
      const clientData = clients.map(c => ({
        id: c.id,
        name: c.name,
        last_contact_date: c.last_contact_date,
        portfolio_value: c.portfolio_value,
        portfolio_performance_change: c.portfolio_performance_change,
        life_events: c.life_events,
        meeting_notes: c.meeting_notes
      }));

      const systemPrompt = `You are a financial advisor's risk assessment engine. 
You must analyze the advisor's clients, specifically looking at:
1. Quantitative metrics (portfolio performance drops, days since last contact).
2. Qualitative and emotional signals in the free-text meeting notes (anxiety, panic, retirement needs, life changes, requests to pull funds).

Return a JSON array of objects representing all clients ranked in order of urgency (highest urgency first).
Each object must have exactly these keys:
- id: (integer) the client ID
- name: (string) client name
- urgency: ('high' | 'med' | 'low') based on qualitative & quantitative threat of attrition or distress
- reason: (string) a plain-language reason for their priority (MAX 12 words)
- score: (integer, 0 to 100) an urgency score where higher means more urgent.

Do not wrap the response in markdown code blocks or add any text other than the raw JSON array. Make sure the JSON is valid.`;

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: JSON.stringify(clientData)
        }]
      });

      const jsonText = response.content[0].text.trim().replace(/^```json/, '').replace(/```$/, '').trim();
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Claude API Error (Priority Ranking):', error.message);
    }
  }

  // Smart Local Fallback
  return clients.map(c => {
    let score = 20;
    let urgency = 'low';
    let reason = 'Client portfolio is stable and in touch.';

    const notesLower = c.meeting_notes.toLowerCase();
    const lifeLower = c.life_events ? c.life_events.toLowerCase() : '';
    
    // Calculate Score based on contact days (assuming reference date is 2026-06-20)
    let daysSinceContact = 15; // default fallback
    if (c.last_contact_date) {
      const contactDate = new Date(c.last_contact_date);
      const refDate = new Date('2026-06-20');
      const diffTime = Math.abs(refDate - contactDate);
      daysSinceContact = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    if (notesLower.includes('anxious') || notesLower.includes('volatility') || notesLower.includes('pull out')) {
      score += 45;
      reason = 'Anxious about market volatility in meeting notes.';
    }
    if (c.portfolio_performance_change <= -0.05) {
      score += 20;
      reason = `Significant portfolio drop (${Math.round(c.portfolio_performance_change * 100)}%) requires review.`;
    }
    if (daysSinceContact >= 30) {
      score += 15;
      if (score > 50) {
        reason = `${daysSinceContact} days since contact & anxious in notes.`;
      } else {
        reason = `No client contact for ${daysSinceContact} days.`;
      }
    }
    if (lifeLower.includes('retirement') || notesLower.includes('retirement')) {
      score += 10;
      if (score < 50) reason = 'Flagged near-term retirement planning needs.';
    }
    if (lifeLower.includes('succession') || notesLower.includes('succession') || notesLower.includes('exit')) {
      score += 15;
      if (score < 60) reason = 'SME owner planning exit; needs succession advice.';
    }

    // Cap score at 99
    score = Math.min(score, 99);

    if (score >= 70) {
      urgency = 'high';
    } else if (score >= 40) {
      urgency = 'med';
    }

    return {
      id: c.id,
      name: c.name,
      urgency,
      reason,
      score
    };
  }).sort((a, b) => b.score - a.score);
}

// 3. CPD Course Recommendations
async function recommendCPD(clients, cpdModules) {
  if (anthropic) {
    try {
      const clientBook = clients.map(c => ({
        id: c.id,
        name: c.name,
        life_events: c.life_events,
        meeting_notes: c.meeting_notes
      }));
      const modules = cpdModules.map(m => ({
        id: m.id,
        title: m.title,
        hours: m.hours,
        description: m.description,
        completed: m.completed
      }));

      const systemPrompt = `You are a compliance and continuous professional development (CPD) counselor for financial advisors. 
Analyze the advisor's client profiles and the list of available CPD modules. 
Identify skill deficits based on client circumstances (e.g. if multiple clients flag retirement/EPF needs, and EPF module is uncompleted, recommend it).
Only recommend modules that are currently NOT completed (completed = 0).

Return a JSON array of recommended items. Each item must have:
- cpd_id: (integer) the ID of the CPD module
- urgency: ('high' | 'med')
- justification: (string) A concise, evidence-based reason (MAX 25 words) linking the recommendation to specific clients (e.g., "4 clients have flagged retirement planning needs, but you haven't completed the EPF module").

Only output the raw JSON array. Do not include markdown formatting or extra dialogue. Make sure the JSON is valid.`;

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 800,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: JSON.stringify({ clients: clientBook, modules })
        }]
      });

      const jsonText = response.content[0].text.trim().replace(/^```json/, '').replace(/```$/, '').trim();
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Claude API Error (CPD Recommendations):', error.message);
    }
  }

  // Smart Local Fallback
  const recommendations = [];
  const uncompleted = cpdModules.filter(m => !m.completed);

  // Check client profiles to make match
  const hasRetirementNeeds = clients.some(c => 
    c.meeting_notes.toLowerCase().includes('retirement') || 
    c.meeting_notes.toLowerCase().includes('epf') ||
    (c.life_events && c.life_events.toLowerCase().includes('retired'))
  );

  const hasSuccessionNeeds = clients.some(c => 
    c.meeting_notes.toLowerCase().includes('succession') || 
    c.meeting_notes.toLowerCase().includes('exit') ||
    c.meeting_notes.toLowerCase().includes('business owner') ||
    (c.life_events && c.life_events.toLowerCase().includes('business owner'))
  );

  const epfModule = uncompleted.find(m => m.title.includes('EPF'));
  if (epfModule && hasRetirementNeeds) {
    recommendations.push({
      cpd_id: epfModule.id,
      urgency: 'high',
      justification: '4 of your clients flagged retirement needs, including David and Siti. You haven\'t completed this module yet.'
    });
  }

  const successionModule = uncompleted.find(m => m.title.includes('Succession'));
  if (successionModule && hasSuccessionNeeds) {
    recommendations.push({
      cpd_id: successionModule.id,
      urgency: 'med',
      justification: 'Tan is a new business owner planning his exit strategy. This module directly applies to his situation.'
    });
  }

  // Fill in case nothing matches
  if (recommendations.length === 0 && uncompleted.length > 0) {
    recommendations.push({
      cpd_id: uncompleted[0].id,
      urgency: 'med',
      justification: `Recommended to support general portfolio performance and advisory skill development.`
    });
  }

  return recommendations;
}

// 4. Pre-Meeting Brief Generator
async function generatePreMeetingBrief(client) {
  if (anthropic) {
    try {
      const systemPrompt = `You are a financial advisor's pre-meeting intelligence brief generator. 
Given a client profile, synthesize a high-value knowledge brief and 3 actionable talking points.
Tailor the points specifically to their concerns (such as market anxiety, retirement, or SME exit).
Refer to Malaysian financial context (EPF, local tax, Shariah compliance) where relevant.

Return a JSON object containing:
- client_name: (string) Client's name
- situation_summary: (string) 1-2 sentence overview of their financial situation and emotional context.
- talking_points: (array of strings) exactly 3 talking points/questions to guide the meeting.

Only output the raw JSON object. Do not include markdown formatting or extra dialogue. Make sure the JSON is valid.`;

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 600,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: JSON.stringify(client)
        }]
      });

      const jsonText = response.content[0].text.trim().replace(/^```json/, '').replace(/```$/, '').trim();
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Claude API Error (Pre-meeting Brief):', error.message);
    }
  }

  // Smart Local Fallback
  const points = [];
  let summary = '';

  const notesLower = client.meeting_notes.toLowerCase();

  if (notesLower.includes('anxious') || notesLower.includes('volatility')) {
    summary = `${client.name} is feeling anxious about recent market movements. They have requested reassurance regarding their portfolio value of RM ${client.portfolio_value.toLocaleString()}.`;
    points.push(`Acknowledge recent volatility and validate their anxiety without agreeing to panic sell.`);
    points.push(`Present historical recovery metrics showing long-term benefits of staying invested.`);
    points.push(`Propose a minor asset reallocation towards defensive instruments or cash reserves if their risk tolerance has structurally shifted.`);
  } else if (notesLower.includes('succession') || notesLower.includes('exit')) {
    summary = `${client.name} is an SME owner focused on planning their business succession and exit strategy. They require legal and estate structure guidance.`;
    points.push(`Discuss business valuation and the timeframe they have in mind for the business exit.`);
    points.push(`Explain the role of a Buy-Sell agreement funded by Keyperson insurance/Takaful structures.`);
    points.push(`Propose introducing them to Encik Farid Hassan (Corporate Law specialist) to draft the legal documentation.`);
  } else if (notesLower.includes('retirement') || notesLower.includes('epf')) {
    summary = `${client.name} is approaching retirement and is focused on tax-efficient EPF withdrawal options and securing regular post-retirement income.`;
    points.push(`Review the timeline for their EPF Account 1 & 2 withdrawal eligibility.`);
    points.push(`Evaluate structured private retirement schemes (PRS) to supplement their retirement fund.`);
    points.push(`Map out estimated post-retirement monthly cash flow needs against their current RM ${client.portfolio_value.toLocaleString()} portfolio.`);
  } else {
    summary = `${client.name} is in good standing with a portfolio value of RM ${client.portfolio_value.toLocaleString()}. They are looking to optimize their portfolio allocations.`;
    points.push(`Provide an overview of their portfolio's performance over the last quarter.`);
    points.push(`Discuss any recent life events or shifts in financial goals since our last discussion.`);
    points.push(`Explore opportunities in emerging regional funds or structured products to diversify risk.`);
  }

  return {
    client_name: client.name,
    situation_summary: summary,
    talking_points: points
  };
}

// 5. Ask Adviance Query Responder
async function askAdvianceQuestion(query, clientBook) {
  if (anthropic) {
    try {
      const clients = clientBook.map(c => ({ name: c.name, notes: c.meeting_notes, events: c.life_events }));
      const systemPrompt = `You are "Adviance", an intelligent financial AI assistant operating under Malaysian financial regulations (Bank Negara, Securities Commission, FIMC guidelines).
Answer the advisor's question clearly, concisely, and with local compliance context (e.g. EPF rules, Faraid/Wasiat Shariah concepts, Takaful structures vs conventional insurance).
If the question is about a specific client (e.g., "Why is David anxious?"), consult the client book provided. 
If the question is general, answer directly.
Limit the response to 120 words. Keep it professional, analytical, and structured.`;

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 400,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: `Advisor Question: "${query}"\n\nAdvisor's Client Book:\n${JSON.stringify(clients)}`
        }]
      });

      return response.content[0].text.trim();
    } catch (error) {
      console.error('Claude API Error (Ask Adviance):', error.message);
    }
  }

  // Smart Local Fallback
  const q = query.toLowerCase();
  
  // Specific client lookups
  if (q.includes('david') || q.includes('lim')) {
    return `According to client files, **David Lim** is feeling anxious due to recent global market volatility affecting his RM 820,000 portfolio (down 2%). Since he is retired, he has expressed concern about capital preservation and asked about liquidating his holdings. Suggest a reassurance call focusing on historical resilience.`;
  }
  if (q.includes('ahmad') || q.includes('razif')) {
    return `**Ahmad Razif** is currently dealing with an SME business succession. His portfolio performance has decreased by 8% recently. He requires professional legal assistance to structure his business exit, making him a prime candidate for a referral to Encik Farid Hassan.`;
  }
  if (q.includes('siti') || q.includes('norzaha')) {
    return `**Siti Norzaha** has a healthy portfolio of RM 1.2M (up 12%). Her main interest is retirement planning, specifically EPF Account withdrawal strategies and Shariah-compliant annuity products as she approaches retirement.`;
  }
  if (q.includes('tan') || q.includes('wei ming')) {
    return `**Tan Wei Ming** is a new business owner who has recently married. He needs onboarding support, collection of necessary documentation, and long-term advice on SME business protection planning.`;
  }

  // General financial topics
  if (q.includes('takaful') || q.includes('islamic')) {
    return `**Takaful vs Conventional Insurance**: Takaful is based on Shariah principles of mutual cooperation (Ta'awun) and donation (Tabarru'), where policyholders contribute to a mutual fund to share risk, avoiding interest (Riba), gambling (Maisir), and uncertainty (Gharar). Conventional insurance is a risk-transfer contract between the buyer and corporate insurer.`;
  }
  if (q.includes('epf') || q.includes('retirement')) {
    return `**EPF (Employee Provident Fund) Malaysia**: Upon reaching age 55, contributors can withdraw their savings partially or fully (Akaun 55). Under the current rules, Account 1 (retirement focus) and Account 2 (mid-term withdrawals) merge, and Account 3 (Flexible) allows daily withdrawals. Promoting Private Retirement Schemes (PRS) is key to bridging retirement savings gaps.`;
  }
  if (q.includes('succession') || q.includes('exit')) {
    return `**SME Succession Planning**: In Malaysia, succession planning involves keyperson Takaful/insurance policies, Buy-Sell Agreements funded by these policies, and trust deeds. This ensures that surviving business partners can buy out the deceased/departed partner's shares from their heirs without depleting operating capital.`;
  }
  if (q.includes('wasiat') || q.includes('estate') || q.includes('shariah')) {
    return `**Islamic Estate Planning**: Under Malaysian Shariah Wasiat law, a Muslim can only bequeath up to 1/3 of their estate to non-heirs via a Wasiat (will). The remaining 2/3 must be distributed among legal heirs according to Faraid (Islamic law of inheritance) unless all heirs consent otherwise. Hibah (gift) is often used to transfer assets during one's lifetime to bypass Faraid.`;
  }

  return `Adviance Assistant: I've processed your query. To address "${query}", I recommend evaluating your client profiles, validating regulatory guidelines (such as Bank Negara Malaysia guidelines), or formulating a structured strategy to address the specific client goal. Let me know if you would like me to draft talking points.`;
}

// 6. Specialist Partner Finder
async function matchPartner(clientNeed, clientBook, partnersList) {
  if (anthropic) {
    try {
      const systemPrompt = `You are a professional networking matching algorithm for financial advisors.
Analyze the advisor's client need: "${clientNeed}".
Compare this against the advisor's active client book and the directory of external specialist partners.

Return the top 2 matching partners. For each match, supply:
- partner_id: (integer) the ID of the matched partner
- compatibility: ('hot' | 'warm' | 'cold') based on their referral volume and fit
- reason: (string) evidence-based reason (MAX 25 words) linking their specific expertise to this client's need.
- draft_email: (string) A concise, warm, professional message from the advisor (Ahmad) introducing the client to the partner.

Return ONLY a valid JSON array of objects. Do not include markdown syntax or extra text. Make sure the JSON is valid.`;

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: JSON.stringify({ clientNeed, clientBook, partners: partnersList })
        }]
      });

      const jsonText = response.content[0].text.trim().replace(/^```json/, '').replace(/```$/, '').trim();
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Claude API Error (Partner Match):', error.message);
    }
  }

  // Smart Local Fallback
  const q = clientNeed.toLowerCase();
  let matchedPartners = [];

  // Match based on query
  if (q.includes('lawyer') || q.includes('succession') || q.includes('exit') || q.includes('estate') || q.includes('wasiat')) {
    // Farid Hassan (1) and Lim & Co (4)
    const farid = partnersList.find(p => p.id === 1 || p.name.includes('Farid'));
    const lim = partnersList.find(p => p.id === 4 || p.name.includes('Lim'));
    if (farid) matchedPartners.push({ partner: farid, compatibility: 'hot', reason: 'Encik Farid Hassan is a corporate law specialist with 3 active referrals from your book, focusing specifically on SME business succession.' });
    if (lim) matchedPartners.push({ partner: lim, compatibility: 'warm', reason: 'Lim & Co. specialises in estate planning and trust law, having successfully resolved 2 similar client asset allocations recently.' });
  } else if (q.includes('takaful') || q.includes('islamic') || q.includes('insurance') || q.includes('shariah')) {
    // Dr. Nurul Aina (2) and Lim & Co (4)
    const aina = partnersList.find(p => p.id === 2 || p.name.includes('Nurul'));
    const lim = partnersList.find(p => p.id === 4 || p.name.includes('Lim'));
    if (aina) matchedPartners.push({ partner: aina, compatibility: 'hot', reason: 'Dr. Nurul Aina is a premier Takaful and Islamic Wealth advisor, making her perfect for structuring Shariah-compliant coverage.' });
    if (lim) matchedPartners.push({ partner: lim, compatibility: 'warm', reason: 'Lim & Co. provides Islamic estate structure services alongside conventional trust drafting.' });
  } else if (q.includes('tax') || q.includes('taxation') || q.includes('audit')) {
    // James Tan (3)
    const james = partnersList.find(p => p.id === 3 || p.name.includes('James'));
    const farid = partnersList.find(p => p.id === 1 || p.name.includes('Farid'));
    if (james) matchedPartners.push({ partner: james, compatibility: 'warm', reason: 'James Tan is a certified tax consultant. Although referral activity is currently low (cold), his corporate tax expertise is highly relevant.' });
    if (farid) matchedPartners.push({ partner: farid, compatibility: 'warm', reason: 'Encik Farid Hassan handles corporate restructuring, which closely impacts tax-effective business exit plans.' });
  }

  // Default fallback if no keywords match
  if (matchedPartners.length === 0) {
    const farid = partnersList[0];
    const aina = partnersList[1];
    if (farid) matchedPartners.push({ partner: farid, compatibility: 'hot', reason: 'Farid has the highest referral health and handles general legal advisory needs for client business and succession structures.' });
    if (aina) matchedPartners.push({ partner: aina, compatibility: 'warm', reason: 'Dr. Nurul Aina handles Islamic finance structures, suitable for estate and financial security referrals.' });
  }

  // Generate draft emails
  return matchedPartners.map(m => {
    // Find client name from the book or default to "Ahmad's client"
    let clientName = 'Ahmad Razif'; // default
    if (q.includes('ahmad')) clientName = 'Ahmad Razif';
    else if (q.includes('david')) clientName = 'David Lim';
    else if (q.includes('tan') || q.includes('wei ming')) clientName = 'Tan Wei Ming';
    else if (q.includes('siti')) clientName = 'Siti Norzaha';

    const pName = m.partner.name;
    const specialty = m.partner.specialty;

    const email = `Subject: Client Referral & Introduction: ${clientName}

Dear ${pName},

I hope this message finds you well. 

I am writing to introduce my client, ${clientName}, who is currently looking for specialized advice in ${specialty}. Given your strong track record and our successful collaborations in the past, I highly recommended your services.

I have cc'd ${clientName} on this email so you can connect directly. I appreciate your expert guidance on this matter.

Warm regards,
Ahmad Razif
Financial Advisor, Adviance`;

    return {
      partner_id: m.partner.id,
      name: m.partner.name,
      specialty: m.partner.specialty,
      recent_referral_count: m.partner.recent_referral_count,
      compatibility: m.compatibility,
      reason: m.reason,
      draft_email: email
    };
  });
}

module.exports = {
  generateMorningBriefing,
  rankClientPriorities,
  recommendCPD,
  generatePreMeetingBrief,
  askAdvianceQuestion,
  matchPartner
};
