import React from 'react';

const DocumentationView: React.FC = () => {
  const CheckIcon = (props: { className?: string }) => (
    <svg className={props.className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-20">
      <div className="bg-gradient-to-br from-[#073D44] to-[#407B7E] rounded-[20px] p-8 md:p-10 text-white border border-white/10 shadow-sm">
        <h1 className="text-[28px] leading-[36px] font-bold tracking-tight">FAQ</h1>
        <p className="mt-3 text-[15px] leading-[24px] text-white/80">Quick answers to common questions about QAPulse.</p>
      </div>

      <section className="space-y-6">
        <div className="bg-white rounded-[20px] border border-slate-200 p-2 md:p-3 shadow-sm">
          <div className="space-y-2">
            {[
              {
                q: 'How do I create a Weekly Report?',
                a: 'Go to Weekly Report, choose Project/Program and dates, then initiate the snapshot. Fill the form and save as Draft or Publish from the report screen.',
              },
              {
                q: 'Why can’t I edit or delete some reports?',
                a: 'Only the report creator can edit or delete a report. If you are not the owner, you can still view it.',
              },
              {
                q: 'How do I download a report?',
                a: 'From the Weekly Report list, open the kebab menu and use Download PDF or Download PPT. You can also download from inside the report view.',
              },
              {
                q: 'What do the Year/Month/Week filters do?',
                a: 'They filter the Weekly Report list by time period so you can quickly find a report without scrolling.',
              },
              {
                q: 'Why is Publish not available or not working?',
                a: 'Publishing is only allowed when required fields are filled (dates, goals, capacity, strength, sprint health, bottlenecks, decisions, and threads).',
              },
              {
                q: 'Can I recover a deleted report?',
                a: 'No. Deleting a report removes it from the list immediately. If you need it again, create a new report.',
              },
            ].map(({ q, a }) => (
              <details key={q} className="group bg-white rounded-[16px] border border-slate-200 overflow-hidden">
                <summary className="cursor-pointer list-none px-5 py-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-lg bg-[#407B7E]/5 border border-[#407B7E]/20 flex items-center justify-center text-[#073D44] shrink-0">
                      <CheckIcon className="text-[#073D44]" />
                    </span>
                    <span className="text-[14px] font-semibold text-slate-900">{q}</span>
                  </div>
                  <span className="text-slate-400 group-open:rotate-180 transition-transform">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </summary>
                <div className="px-5 pb-5 text-[14px] leading-[22px] text-slate-600">
                  {a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default DocumentationView;
