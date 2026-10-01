# Demo video script (5 to 7 minutes)

Focus only on the agent and what it does. Sara (RevRag) guides by voice and you fill the form as she instructs; if RevRag enables Action Intelligence for the agent, she fills it herself and the action timeline shows each step. No architecture or feedback talk. Record in Chrome with system audio on so Sara's voice is captured. Start from a fresh tab (application data lives in session storage).

| Time | You do / say | What the viewer should see |
|---|---|---|
| 0:00 | Open the live link. Click **Talk to Sara** and allow the microphone. | The RevRag voice call connects; Sara greets you; the panel shows the live transcript. |
| 0:20 | "What kinds of loans do you have?" | Sara lists the four products briefly (voice). |
| 0:40 | "What's the interest rate on a personal loan, and how long can I take it for?" | Accurate rate range and 12 to 72 months. |
| 1:00 | **"I want a 5 lakh personal loan for 3 years."** | Sara opens Loan details, product, amount, tenure glow as they fill, she asks for the purpose. |
| 1:20 | "It's for a family wedding." | Purpose selected, Sara presses Continue herself and lands on Eligibility, asks for DOB and income. |
| 1:40 | "What will my EMI be?" | Exact EMI from the calculator tool. |
| 2:00 | "I was born on 14 April 1992, I'm salaried, I take home 85,000 a month, no other loans, and my CIBIL is around 760." | All five fields fill in one go, eligibility runs, result card highlights: eligible up to 13 lakh. |
| 2:30 | "Actually, make it 6 lakh." | Sara updates the amount on the earlier screen and mentions the new EMI (updating previous info). |
| 2:50 | On Personal info, click into nothing and ask: **"What do I need to enter here?"** | Context-aware guidance for this screen. |
| 3:05 | "My name is Aarav Sharma, male, single, PAN A B C D E 1 2 3 4 F, email aarav dot sharma at gmail dot com, mobile 98765 43210." | Fields fill; Sara reads PAN back for confirmation. |
| 3:30 | "Yes, that's right." | Continue to Employment: income and employment type are already carried over; Sara only asks for employer, designation, experience. |
| 3:50 | "I work at Infosys as a senior engineer, 6 years experience." Then address in one sentence. | Fills, moves on. |
| 4:20 | Bank: "HDFC, account 50100123456789, IFSC H D F C 1 2 3 4 5 6 7." | **Error recovery:** IFSC invalid (5th char must be 0); Sara explains and asks again. Say the correct one. |
| 4:50 | Click **Continue** yourself on Documents with nothing uploaded. | Proactive help: Sara notices the blocked Continue and points to the uploads. |
| 5:05 | "Can you use the sample documents?" | Sample docs attached. Sara moves to Review. |
| 5:20 | "Show me my bank details." | Scrolls to and highlights the bank section of the review. |
| 5:35 | Sara asks for consents. "Yes, I agree to both." Then "Yes, submit it." | Consents tick, application submits, ID spoken. |
| 6:00 | "What happens next, and how long will approval take?" | Post-submission steps from the confirmation screen context. |

Tips: speak naturally and pause briefly after each request; you can talk over Sara to interrupt her. Open the Status pill before recording to confirm the RevRag SDK is initialised; during the call it counts the screen snapshots, missions and actions.
