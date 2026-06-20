# ImagineHack2026
Project Title: 
Adviance

Project Description:
Adviance is a web-based advisory assistant platform that addresses three connected problems facing financial advisors today: fragmented client management, static and disconnected learning resources, and partner ecosystems. Rather than three separate tools, Adviance unifies them into one platform where client data flows naturally into learning recommendations and partner matching.

Technologies Used:
HTML, CSS, Javascript; Claude and Chatgpt were used to assist with coding

Team Members: 

Jeevika Akshaya, Fariya Hossain, Shahriar Kabir Chowdhury, Khan Rubayet Ismail, Nikhil Purlacee


Challenge and Approach:

Challenge:
AAG × ASG asked for one organisation-wide platform , not a one-off tool, covering three outcomes: 1. client attention, living CPD learning, and partnership visibility. The hard part wasn't any single outcome; it was making all three work together. Most existing tools solve just one: CRMs handle clients, CPD platforms handle learning, partner tools handle referrals, none of them share data, so advisors still end up stitching five tools together by hand.

Why we chose this: 
We researched the market first rather than assuming a gap. Funded tools like Nevis automate advisor admin, RightCapital handles planning calculations, CPD libraries let advisors browse courses by role, every one of them is a standalone tool. None let a client's actual needs flow through to also shape what the advisor learns next or who they get introduced to. That's the real gap: not "AI for advisors," but one shared client data layer driving three outcomes at once.

Our approach: 
We treated this as a product problem first. We cut a sentiment-analysis idea once it started feeling like surveilling client notes. We replaced free-text partner search with a pre-approved category dropdown once we realised real firms can't let advisors refer clients to unvetted partners. We kept CPD tracking out of any comparative score so learning stays personal, not monitored.

Technically, we built one shared client data model that both Learning and Partners read from, Gemini handles the cross-referencing (client need × advisor gap, client need × authorised partner), everything else stays simple, transparent code. AI is added only where it adds real reasoning, nowhere else.
