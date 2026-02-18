import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import api from '../../api/client';

export function AdminPage() {
  const qc = useQueryClient();
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    role: 'STUDENT',
    password: 'Password123!',
  });
  const [subjectName, setSubjectName] = useState('');
  const [chapterForm, setChapterForm] = useState({ subjectId: '', name: '' });
  const [topicForm, setTopicForm] = useState({ chapterId: '', name: '' });
  const [prereqForm, setPrereqForm] = useState({ topicId: '', prerequisiteTopicId: '' });
  const [resourceForm, setResourceForm] = useState({
    topicId: '',
    type: 'DOCUMENT',
    title: '',
    url: '',
    priority: 1,
  });
  const [questionBankFile, setQuestionBankFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);

  const users = useQuery({ queryKey: ['admin-users'], queryFn: async () => (await api.get('/admin/users')).data });
  const taxonomy = useQuery({ queryKey: ['taxonomy'], queryFn: async () => (await api.get('/taxonomy')).data });
  const logs = useQuery({ queryKey: ['audit-logs'], queryFn: async () => (await api.get('/admin/audit-logs')).data });
  const metrics = useQuery({
    queryKey: ['tenant-metrics'],
    queryFn: async () => (await api.get('/admin/tenant-metrics')).data,
  });
  const questions = useQuery({
    queryKey: ['admin-questions'],
    queryFn: async () => (await api.get('/admin/questions')).data,
  });
  const topicResources = useQuery({
    queryKey: ['admin-topic-resources'],
    queryFn: async () => (await api.get('/admin/topic-resources')).data,
  });

  const subjects = taxonomy.data || [];
  const chapters = useMemo(
    () => subjects.flatMap((s: any) => s.chapters.map((c: any) => ({ id: c.id, name: c.name }))),
    [subjects],
  );
  const topics = useMemo(
    () =>
      subjects.flatMap((s: any) =>
        s.chapters.flatMap((c: any) => c.topics.map((t: any) => ({ id: t.id, name: t.name }))),
      ),
    [subjects],
  );

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/admin/users', userForm);
    setUserForm({ ...userForm, name: '', email: '' });
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    qc.invalidateQueries({ queryKey: ['audit-logs'] });
  }

  async function updateRole(userId: string, role: string) {
    await api.patch(`/admin/users/${userId}/role`, { role });
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    qc.invalidateQueries({ queryKey: ['audit-logs'] });
  }

  async function createSubject(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/taxonomy/subjects', { name: subjectName });
    setSubjectName('');
    qc.invalidateQueries({ queryKey: ['taxonomy'] });
  }

  async function createChapter(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/taxonomy/chapters', chapterForm);
    setChapterForm({ subjectId: '', name: '' });
    qc.invalidateQueries({ queryKey: ['taxonomy'] });
  }

  async function createTopic(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/taxonomy/topics', topicForm);
    setTopicForm({ chapterId: '', name: '' });
    qc.invalidateQueries({ queryKey: ['taxonomy'] });
  }

  async function createPrereq(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/taxonomy/prerequisites', prereqForm);
    setPrereqForm({ topicId: '', prerequisiteTopicId: '' });
  }

  async function updateQuestionStatus(id: string, status: string) {
    await api.patch(`/admin/questions/${id}/status`, { status });
    qc.invalidateQueries({ queryKey: ['admin-questions'] });
    qc.invalidateQueries({ queryKey: ['audit-logs'] });
  }

  async function createTopicResource(e: React.FormEvent) {
    e.preventDefault();
    await api.post('/admin/topic-resources', resourceForm);
    setResourceForm({ topicId: '', type: 'DOCUMENT', title: '', url: '', priority: 1 });
    qc.invalidateQueries({ queryKey: ['admin-topic-resources'] });
    qc.invalidateQueries({ queryKey: ['audit-logs'] });
  }

  async function deactivateTopicResource(id: string) {
    await api.patch(`/admin/topic-resources/${id}/deactivate`);
    qc.invalidateQueries({ queryKey: ['admin-topic-resources'] });
    qc.invalidateQueries({ queryKey: ['audit-logs'] });
  }

  async function uploadQuestionBank(e: React.FormEvent) {
    e.preventDefault();
    if (!questionBankFile) return;
    const formData = new FormData();
    formData.append('file', questionBankFile);
    const { data } = await api.post('/admin/question-bank/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    setUploadResult(data);
    setQuestionBankFile(null);
    qc.invalidateQueries({ queryKey: ['taxonomy'] });
    qc.invalidateQueries({ queryKey: ['admin-questions'] });
    qc.invalidateQueries({ queryKey: ['audit-logs'] });
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Admin Portal</h2>

      <section className="grid grid-cols-4 gap-3 rounded bg-white p-4 shadow">
        <div className="rounded border p-3">
          <p className="text-sm text-slate-500">Active Users</p>
          <p className="text-xl font-semibold">{metrics.data?.activeUsers ?? 0}</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-sm text-slate-500">AI Used</p>
          <p className="text-xl font-semibold">
            {metrics.data?.aiUsage?.used ?? 0} / {metrics.data?.aiUsage?.limit ?? 0}
          </p>
        </div>
        <div className="rounded border p-3">
          <p className="text-sm text-slate-500">Approved Questions</p>
          <p className="text-xl font-semibold">{metrics.data?.questionGovernance?.approvedQuestions ?? 0}</p>
        </div>
        <div className="rounded border p-3">
          <p className="text-sm text-slate-500">Draft Questions</p>
          <p className="text-xl font-semibold">{metrics.data?.questionGovernance?.draftQuestions ?? 0}</p>
        </div>
      </section>

      <section className="rounded bg-white p-4 shadow">
        <h3 className="font-medium">Users</h3>
        <form className="mt-3 grid grid-cols-4 gap-2" onSubmit={createUser}>
          <input
            className="rounded border p-2"
            placeholder="Name"
            value={userForm.name}
            onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
          />
          <input
            className="rounded border p-2"
            placeholder="Email"
            value={userForm.email}
            onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
          />
          <select
            className="rounded border p-2"
            value={userForm.role}
            onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
          >
            <option>STUDENT</option>
            <option>TEACHER</option>
            <option>ADMIN</option>
          </select>
          <button className="rounded bg-brand px-3 py-2 text-white">Create</button>
        </form>
        <ul className="mt-3 space-y-1 text-sm">
          {(users.data || []).map((u: any) => (
            <li key={u.id} className="flex items-center justify-between rounded border p-2">
              <span>
                {u.name} | {u.email}
              </span>
              <div className="flex items-center gap-2">
                <select
                  className="rounded border p-1"
                  defaultValue={u.role}
                  onChange={(e) => updateRole(u.id, e.target.value)}
                >
                  <option>STUDENT</option>
                  <option>TEACHER</option>
                  <option>ADMIN</option>
                </select>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded bg-white p-4 shadow">
        <h3 className="font-medium">Taxonomy</h3>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <form className="space-y-2 rounded border p-3" onSubmit={createSubject}>
            <p className="font-medium">Add Subject</p>
            <input
              className="w-full rounded border p-2"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
              placeholder="Subject name"
            />
            <button className="rounded bg-brand px-3 py-2 text-white">Create Subject</button>
          </form>
          <form className="space-y-2 rounded border p-3" onSubmit={createChapter}>
            <p className="font-medium">Add Chapter</p>
            <select
              className="w-full rounded border p-2"
              value={chapterForm.subjectId}
              onChange={(e) => setChapterForm({ ...chapterForm, subjectId: e.target.value })}
            >
              <option value="">Select subject</option>
              {subjects.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded border p-2"
              value={chapterForm.name}
              onChange={(e) => setChapterForm({ ...chapterForm, name: e.target.value })}
              placeholder="Chapter name"
            />
            <button className="rounded bg-brand px-3 py-2 text-white">Create Chapter</button>
          </form>
          <form className="space-y-2 rounded border p-3" onSubmit={createTopic}>
            <p className="font-medium">Add Topic</p>
            <select
              className="w-full rounded border p-2"
              value={topicForm.chapterId}
              onChange={(e) => setTopicForm({ ...topicForm, chapterId: e.target.value })}
            >
              <option value="">Select chapter</option>
              {chapters.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded border p-2"
              value={topicForm.name}
              onChange={(e) => setTopicForm({ ...topicForm, name: e.target.value })}
              placeholder="Topic name"
            />
            <button className="rounded bg-brand px-3 py-2 text-white">Create Topic</button>
          </form>
          <form className="space-y-2 rounded border p-3" onSubmit={createPrereq}>
            <p className="font-medium">Add Prerequisite</p>
            <select
              className="w-full rounded border p-2"
              value={prereqForm.topicId}
              onChange={(e) => setPrereqForm({ ...prereqForm, topicId: e.target.value })}
            >
              <option value="">Topic</option>
              {topics.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              className="w-full rounded border p-2"
              value={prereqForm.prerequisiteTopicId}
              onChange={(e) => setPrereqForm({ ...prereqForm, prerequisiteTopicId: e.target.value })}
            >
              <option value="">Prerequisite topic</option>
              {topics.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button className="rounded bg-brand px-3 py-2 text-white">Add Link</button>
          </form>
        </div>
      </section>

      <section className="rounded bg-white p-4 shadow">
        <h3 className="font-medium">Question Bank Upload (CSV)</h3>
        <p className="mt-1 text-sm text-slate-600">
          Required headers: subject,chapter,topic,stem,explanation,difficulty,expectedSolveTimeSec,optionA,optionB,optionC,optionD,correctOption,source,status
        </p>
        <form className="mt-3 flex items-center gap-2" onSubmit={uploadQuestionBank}>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setQuestionBankFile(e.target.files?.[0] || null)}
          />
          <button className="rounded bg-brand px-3 py-2 text-white" disabled={!questionBankFile}>
            Upload
          </button>
        </form>
        {uploadResult && (
          <div className="mt-3 rounded border p-3 text-sm">
            <p>Total Rows: {uploadResult.totalRows}</p>
            <p>Created Questions: {uploadResult.createdQuestions}</p>
            <p>Skipped Rows: {uploadResult.skippedRows}</p>
            {uploadResult.errors?.length > 0 && (
              <pre className="mt-2 max-h-36 overflow-auto rounded bg-slate-50 p-2 text-xs">
                {JSON.stringify(uploadResult.errors, null, 2)}
              </pre>
            )}
          </div>
        )}
      </section>

      <section className="rounded bg-white p-4 shadow">
        <h3 className="font-medium">Question Governance</h3>
        <ul className="mt-3 space-y-1 text-sm">
          {(questions.data || []).slice(0, 50).map((q: any) => (
            <li key={q.id} className="flex items-center justify-between rounded border p-2">
              <span className="mr-3 line-clamp-1">{q.stem}</span>
              <select
                className="rounded border p-1"
                defaultValue={q.status}
                onChange={(e) => updateQuestionStatus(q.id, e.target.value)}
              >
                <option>DRAFT</option>
                <option>APPROVED</option>
                <option>PUBLISHED</option>
                <option>ARCHIVED</option>
              </select>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded bg-white p-4 shadow">
        <h3 className="font-medium">Topic Resource Links</h3>
        <form className="mt-3 grid grid-cols-5 gap-2" onSubmit={createTopicResource}>
          <select
            className="rounded border p-2"
            value={resourceForm.topicId}
            onChange={(e) => setResourceForm({ ...resourceForm, topicId: e.target.value })}
          >
            <option value="">Select topic</option>
            {topics.map((t: any) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            className="rounded border p-2"
            value={resourceForm.type}
            onChange={(e) => setResourceForm({ ...resourceForm, type: e.target.value })}
          >
            <option>TOPIC</option>
            <option>VIDEO</option>
            <option>DOCUMENT</option>
          </select>
          <input
            className="rounded border p-2"
            placeholder="Title"
            value={resourceForm.title}
            onChange={(e) => setResourceForm({ ...resourceForm, title: e.target.value })}
          />
          <input
            className="rounded border p-2"
            placeholder="https://..."
            value={resourceForm.url}
            onChange={(e) => setResourceForm({ ...resourceForm, url: e.target.value })}
          />
          <button className="rounded bg-brand px-3 py-2 text-white">Add Resource</button>
        </form>
        <ul className="mt-3 space-y-1 text-sm">
          {(topicResources.data || []).map((r: any) => (
            <li key={r.id} className="flex items-center justify-between rounded border p-2">
              <span>
                [{r.type}] {r.title} ({r.topic?.name})
              </span>
              <div className="flex items-center gap-2">
                <a className="text-blue-700 underline" href={r.url} target="_blank" rel="noreferrer">
                  Open
                </a>
                <button className="rounded bg-rose-600 px-2 py-1 text-white" onClick={() => deactivateTopicResource(r.id)}>
                  Deactivate
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded bg-white p-4 shadow">
        <h3 className="font-medium">Audit Logs</h3>
        <ul className="mt-3 space-y-1 text-sm">
          {(logs.data || []).slice(0, 20).map((l: any) => (
            <li key={l.id} className="rounded border p-2">
              {l.action} | {l.entityType} | {new Date(l.createdAt).toLocaleString()}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
