import React from 'react';

const DocumentationView: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-20">
      <header className="border-b pb-8">
        <h1 className="text-4xl font-black text-slate-900 mb-4">QAPulse System Design</h1>
        <p className="text-lg text-slate-600">Unified QA Management & Reporting Architecture.</p>
      </header>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold border-l-4 border-blue-600 pl-4">1. Access Model</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <p className="text-slate-600 leading-relaxed">
            QAPulse follows a <strong>Unified Feature Model</strong>. All authenticated users gain immediate access to the full suite of QA management tools without role-based friction.
          </p>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <span className="text-blue-600 font-bold">✓</span>
              <span className="text-sm font-medium text-blue-900">Create & Publish Weekly Reports</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <span className="text-blue-600 font-bold">✓</span>
              <span className="text-sm font-medium text-blue-900">Moderate & Delete Archives</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <span className="text-blue-600 font-bold">✓</span>
              <span className="text-sm font-medium text-blue-900">Create Revisions of Published Data</span>
            </div>
            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <span className="text-blue-600 font-bold">✓</span>
              <span className="text-sm font-medium text-blue-900">Access Advanced AI Summarization</span>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold border-l-4 border-blue-600 pl-4">2. MVP Roadmap</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
            <h3 className="font-black text-blue-700 uppercase tracking-widest text-xs mb-4">Phase 1: MVP Core</h3>
            <ul className="text-sm space-y-2 list-disc pl-4 text-blue-800">
              <li>Weekly Report lifecycle (Draft/Published)</li>
              <li>Revision system (History tracking)</li>
              <li>Advanced Search (Year/Month/Week of Month)</li>
              <li>Audit trails (Created/Updated metadata)</li>
            </ul>
          </div>
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
            <h3 className="font-black text-slate-500 uppercase tracking-widest text-xs mb-4">Phase 2: Intelligent Tools</h3>
            <ul className="text-sm space-y-2 list-disc pl-4 text-slate-600">
              <li>Attachments module (Evidence & logs)</li>
              <li>Gemini Summarization for executive snapshots</li>
              <li>PDF/Docx Export engine</li>
              <li>Customizable Team Templates</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold border-l-4 border-blue-600 pl-4">3. Data Model Schema</h2>
        <pre className="bg-slate-900 text-slate-300 p-6 rounded-xl text-xs overflow-x-auto leading-relaxed shadow-xl">
{`{
  "report_id": "UUID",
  "project_id": "UUID",
  "lifecycle": "DRAFT | PUBLISHED | APPROVED",
  "time_indices": {
    "iso_week": 20,
    "year": 2024,
    "month": 5,
    "week_of_month": 3
  },
  "sections": {
    "goals": "Array<GoalRow>",
    "capacity": "CapacityObject",
    "threads": "Array<ThreadRow>"
  },
  "audit": {
    "created_by": "UserID",
    "updated_at": "ISO_8601"
  }
}`}
        </pre>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold border-l-4 border-blue-600 pl-4">4. Search Strategy</h2>
        <div className="p-6 bg-white border rounded-xl space-y-4 text-sm leading-relaxed text-slate-600">
          <p>We leverage a <strong>Composite Index</strong> strategy for the search engine:</p>
          <ul className="list-decimal pl-6 space-y-2">
            <li><strong>Temporal Sharding:</strong> Filter by <code>year</code> and <code>month</code> first to reduce dataset scan size.</li>
            <li><strong>Relational Filtering:</strong> Apply <code>project_id</code> and <code>user_id</code> intersections.</li>
            <li><strong>Status Toggles:</strong> Unified visibility for all published content.</li>
            <li><strong>Revision Linking:</strong> <code>revision_of</code> pointers allow the UI to collapse history into a single record view.</li>
          </ul>
        </div>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-bold border-l-4 border-blue-600 pl-4">5. Senior QA Improvements</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-4 bg-slate-50 rounded-xl border">
            <h4 className="font-bold text-xs uppercase mb-2">Analytics</h4>
            <p className="text-xs text-slate-500">Aggregate "Health" across 12 weeks to identify systemic team fatigue.</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border">
            <h4 className="font-bold text-xs uppercase mb-2">Automation</h4>
            <p className="text-xs text-slate-500">Auto-reminders on Friday 3PM if draft is not yet created for the week.</p>
          </div>
          <div className="p-4 bg-slate-50 rounded-xl border">
            <h4 className="font-bold text-xs uppercase mb-2">Integration</h4>
            <p className="text-xs text-slate-500">Slack/Discord hooks to broadcast published snapshots to stakeholders.</p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default DocumentationView;
