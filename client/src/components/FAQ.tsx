import './FAQ.css';

interface FAQItem {
  question: string;
  answer: string | JSX.Element;
}

const faqs: FAQItem[] = [
  {
    question: "What is REJECT?",
    answer: "A tool that decodes job rejection emails and tracks your application patterns. Paste any rejection email and get honest analysis of what it really means."
  },
  {
    question: "Is my data private?",
    answer: "Yes. Your application data stays in your browser's local storage unless you create an account. Rejection emails are sent to our server for analysis but are never stored."
  },
  {
    question: "What's the difference between Free and Pro?",
    answer: (
      <div>
        <p><strong>Free:</strong> 5 decodes/month, 10 applications in tracker</p>
        <p><strong>Pro:</strong> Unlimited decodes, unlimited applications, AI insights, role fit checker</p>
      </div>
    )
  },
  {
    question: "How do I cancel my subscription?",
    answer: "Email support@reject.app or click \"Manage Subscription\" in your account settings. You can cancel anytime."
  },
  {
    question: "The ATS keeps rejecting me. What should I do?",
    answer: (
      <div>
        <p>If you're getting filtered before human review:</p>
        <ul>
          <li>Apply through referrals when possible</li>
          <li>Connect with recruiters on LinkedIn directly</li>
          <li>Use <a href="https://www.jobscan.co" target="_blank" rel="noopener noreferrer">Jobscan</a> to check resume-job fit</li>
          <li>Focus on roles where your title closely matches</li>
        </ul>
      </div>
    )
  },
  {
    question: "What do the rejection categories mean?",
    answer: (
      <div>
        <ul>
          <li><strong>Template:</strong> Generic automated rejection - don't reply</li>
          <li><strong>Soft No:</strong> Some personalization, but still a no</li>
          <li><strong>Hard No:</strong> Explicitly closes the door</li>
          <li><strong>Door Open:</strong> Genuine invitation to stay in touch (rare)</li>
          <li><strong>Polite Pass:</strong> Personal rejection from someone you interviewed with</li>
        </ul>
      </div>
    )
  },
  {
    question: "Why does my rejection say 'keep on file' but you say it's meaningless?",
    answer: "Studies show less than 5% of companies actually resurface past candidates. It's standard legal language that protects the company, not a genuine promise to consider you later."
  }
];

export function FAQ() {
  return (
    <div className="faq">
      <h2>Frequently Asked Questions</h2>
      <div className="faq-list">
        {faqs.map((faq, index) => (
          <div key={index} className="faq-item">
            <h3>{faq.question}</h3>
            <div className="faq-answer">{faq.answer}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
