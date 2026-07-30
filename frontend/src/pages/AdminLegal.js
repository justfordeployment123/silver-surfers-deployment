import React, { useState, useEffect } from 'react';
import { createLegalDocument, updateLegalDocument, publishLegalDocument, getAllLegalDocuments } from '../api';

const STYLES = `
.al-pg { min-height: 100vh; background: var(--t9); padding: 96px 24px 60px; }
.al-inner { max-width: 900px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px; }
.al-header { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.14); border-radius: var(--r); padding: 32px; }
.al-card { background: var(--surface); border-radius: var(--r); overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.12); }
.al-card-head { padding: 16px 24px; border-bottom: 1px solid #e5e7eb; background: var(--sandd); }
.al-card-body { }
.al-doc-row { padding: 20px 24px; display: flex; align-items: center; justify-content: space-between; gap: 16px; border-bottom: 1px solid #f3f4f6; }
.al-doc-row:last-child { border-bottom: none; }
.al-badge { display: inline-block; padding: 2px 10px; border-radius: 9999px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
.al-badge-pub { background: var(--t05); color: var(--t4); }
.al-badge-draft { background: #fef3c7; color: #d97706; }
.al-btn-edit { padding: 6px 14px; font-size: 12px; font-weight: 700; border-radius: 8px; background: var(--t05); color: var(--t4); border: 1px solid var(--t1); cursor: pointer; }
.al-btn-edit:hover { background: var(--t1); }
.al-btn-pub { padding: 6px 14px; font-size: 12px; font-weight: 700; border-radius: 8px; background: var(--t4); color: #fff; border: none; cursor: pointer; }
.al-btn-pub:hover { background: var(--t8); }
.al-modal-overlay { position: fixed; inset: 0; background: rgba(75,85,99,0.55); overflow-y: auto; z-index: 50; display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; }
.al-modal-card { background: var(--surface); border-radius: var(--r); width: 100%; max-width: 900px; padding: 32px; box-shadow: 0 24px 80px rgba(0,0,0,0.2); }
.al-modal-lbl { display: block; font-size: 13px; font-weight: 700; color: var(--ink); margin-bottom: 6px; }
.al-modal-inp { width: 100%; padding: 12px 16px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 14px; color: var(--ink); background: var(--surface); box-sizing: border-box; }
.al-modal-inp:focus { outline: none; border-color: var(--t4); box-shadow: 0 0 0 3px var(--t05); }
.al-fmt-btn { padding: 4px 10px; font-size: 12px; background: #f3f4f6; border: 1px solid #d1d5db; border-radius: 4px; cursor: pointer; color: var(--ink); }
.al-fmt-btn:hover { background: #e5e7eb; }
.al-skel-line { height: 16px; background: #e5e7eb; border-radius: 4px; }
.al-alert-ok { background: var(--t05); border: 1px solid var(--t1); border-radius: 10px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; }
.al-alert-err { background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25); border-radius: 10px; padding: 12px 16px; display: flex; align-items: center; gap: 10px; }
`;

const AdminLegal = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingDocument, setEditingDocument] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [formData, setFormData] = useState({
    type: 'terms-of-use',
    title: '',
    content: '',
    summary: '',
    version: '1.0',
    language: 'en',
    region: 'US',
    acceptanceRequired: true
  });

  const documentTypes = [
    { value: 'terms-of-use', label: 'Terms of Service', icon: '📋', description: 'User agreement and terms of service' },
    { value: 'privacy-policy', label: 'Privacy Policy', icon: '🔒', description: 'How we collect and use personal data' },
    { value: 'accessibility-guides', label: 'Accessibility Guides', icon: '♿', description: 'Guidelines and resources for web accessibility' },
  ];

  const getDocumentType = (type) => documentTypes.find(t => t.value === type) || documentTypes[0];

  useEffect(() => { loadDocuments(); }, []);

  const loadDocuments = async () => {
    try {
      setLoading(true);
      const result = await getAllLegalDocuments();
      if (result.error) setError(result.error);
      else setDocuments(result.documents || []);
    } catch { setError('Failed to load legal documents'); }
    finally { setLoading(false); }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    try {
      const result = editingDocument
        ? await updateLegalDocument(editingDocument._id, formData)
        : await createLegalDocument(formData);
      if (result.error) { setError(result.error); }
      else {
        setSuccess(editingDocument ? 'Document updated successfully!' : 'Document created successfully!');
        setShowForm(false); setEditingDocument(null); resetForm(); loadDocuments();
      }
    } catch (err) { setError('Error saving document: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleCreate = () => {
    setEditingDocument(null);
    resetForm();
    setShowForm(true);
  };

  const handlePublish = async (documentId) => {
    if (!window.confirm('Are you sure you want to publish this document? This will make it live.')) return;
    try {
      const result = await publishLegalDocument(documentId);
      if (result.error) setError(result.error);
      else { setSuccess('Document published successfully!'); loadDocuments(); }
    } catch (err) { setError('Error publishing document: ' + err.message); }
  };

  const handleEdit = (document) => {
    setEditingDocument(document);
    setFormData({ type: document.type, title: document.title, content: document.content, summary: document.summary, version: document.version, language: document.language, region: document.region, acceptanceRequired: document.acceptanceRequired });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({ type: 'terms-of-use', title: '', content: '', summary: '', version: '1.0', language: 'en', region: 'US', acceptanceRequired: true });
  };

  const formatText = (format) => {
    const textarea = document.querySelector('textarea[name="content"]');
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.substring(start, end);
    if (!selected) return;
    let fmt = '';
    if (format === 'bold') fmt = `**${selected}**`;
    else if (format === 'italic') fmt = `*${selected}*`;
    else if (format === 'large') fmt = `# ${selected}`;
    else if (format === 'medium') fmt = `## ${selected}`;
    else if (format === 'small') fmt = `### ${selected}`;
    else return;
    const newContent = textarea.value.substring(0, start) + fmt + textarea.value.substring(end);
    setFormData(prev => ({ ...prev, content: newContent }));
    setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + fmt.length, start + fmt.length); }, 0);
  };

  if (loading && !showForm) {
    return (
      <>
        <style>{STYLES}</style>
        <div className="al-pg">
          <div className="al-inner">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div className="al-skel-line" style={{ width: '25%' }}></div>
              <div className="al-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div className="al-skel-line" style={{ width: '75%' }}></div>
                <div className="al-skel-line" style={{ width: '50%' }}></div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="al-pg">
        <div className="al-inner">
          <div className="al-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h1 className="h1" style={{ color: '#fff', marginBottom: '8px' }}>Legal Documents</h1>
              <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)' }}>Manage your Terms of Service and Privacy Policy</p>
            </div>
            <button onClick={handleCreate} className="al-btn-pub" style={{ padding: '10px 20px', fontSize: '14px' }}>+ New Document</button>
          </div>

          {success && (
            <div className="al-alert-ok">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20" style={{ color: 'var(--t4)', flexShrink: 0 }}>
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <p style={{ fontSize: '13px', color: 'var(--t9)' }}>{success}</p>
            </div>
          )}

          {error && (
            <div className="al-alert-err">
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 20 20" style={{ color: 'var(--coral)', flexShrink: 0 }}>
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <p style={{ fontSize: '13px', color: 'var(--coral)' }}>{error}</p>
            </div>
          )}

          <div className="al-card">
            <div className="al-card-head">
              <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--t9)' }}>Current Documents</h3>
              <p style={{ fontSize: '13px', color: 'var(--ink6)', marginTop: '2px' }}>Manage your published and draft documents</p>
            </div>

            <div className="al-card-body">
              {documents.length === 0 ? (
                <div style={{ padding: '48px 24px', textAlign: 'center' }}>
                  <svg width="48" height="48" fill="none" stroke="#d1d5db" strokeWidth="2" viewBox="0 0 24 24" style={{ margin: '0 auto 12px' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--ink)' }}>No legal documents found</p>
                  <p style={{ fontSize: '13px', color: 'var(--ink6)', marginTop: '4px' }}>No legal documents yet. Create your first one to get started.</p>
                  <button onClick={handleCreate} className="al-btn-pub" style={{ marginTop: '16px', padding: '10px 20px', fontSize: '14px' }}>+ Create First Document</button>
                </div>
              ) : (
                documents.map((doc) => {
                  const docType = getDocumentType(doc.type);
                  return (
                    <div key={doc._id} className="al-doc-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <span style={{ fontSize: '28px' }}>{docType.icon}</span>
                        <div>
                          <h4 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--t9)' }}>{doc.title}</h4>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px' }}>
                            <span className={`al-badge ${doc.status === 'published' ? 'al-badge-pub' : 'al-badge-draft'}`}>{doc.status}</span>
                            <span style={{ fontSize: '12px', color: 'var(--ink6)' }}>v{doc.version}</span>
                            <span style={{ fontSize: '12px', color: 'var(--ink6)' }}>{doc.language}/{doc.region}</span>
                          </div>
                          {doc.summary && <p style={{ fontSize: '13px', color: 'var(--ink6)', marginTop: '6px' }}>{doc.summary}</p>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                        <button onClick={() => handleEdit(doc)} className="al-btn-edit">Edit</button>
                        {doc.status === 'draft' && (
                          <button onClick={() => handlePublish(doc._id)} className="al-btn-pub">Publish</button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {showForm && (
            <div className="al-modal-overlay">
              <div className="al-modal-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <div>
                    <h3 style={{ fontFamily: 'var(--ffd)', fontSize: '22px', fontWeight: 700, color: 'var(--t9)' }}>{editingDocument ? 'Edit Document' : 'Create New Document'}</h3>
                    <p style={{ fontSize: '13px', color: 'var(--ink6)', marginTop: '4px' }}>{editingDocument ? 'Update your legal document' : 'Add a new legal document'}</p>
                  </div>
                  <button onClick={() => { setShowForm(false); setEditingDocument(null); resetForm(); }} style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '8px' }}>
                    <svg width="24" height="24" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label className="al-modal-lbl">Document Type *</label>
                      <select name="type" value={formData.type} onChange={handleInputChange} className="al-modal-inp" required>
                        {documentTypes.map(type => <option key={type.value} value={type.value}>{type.icon} {type.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="al-modal-lbl">Version *</label>
                      <input type="text" name="version" value={formData.version} onChange={handleInputChange} className="al-modal-inp" placeholder="e.g., 1.0, 1.1" required />
                    </div>
                  </div>

                  <div>
                    <label className="al-modal-lbl">Document Title *</label>
                    <input type="text" name="title" value={formData.title} onChange={handleInputChange} className="al-modal-inp" placeholder="Enter a clear, descriptive title" required />
                  </div>

                  <div>
                    <label className="al-modal-lbl">Summary</label>
                    <textarea name="summary" value={formData.summary} onChange={handleInputChange} rows={3} className="al-modal-inp" placeholder="Brief summary of what this document covers" />
                  </div>

                  <div>
                    <label className="al-modal-lbl">Document Content *</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '8px', padding: '10px 12px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb', alignItems: 'center' }}>
                      <span style={{ fontSize: '12px', color: 'var(--ink6)', marginRight: '4px' }}>Format selected text:</span>
                      {[['bold','B','font-bold'],['italic','I','italic'],['large','H1',''],['medium','H2',''],['small','H3','']].map(([fmt, lbl, cls]) => (
                        <button key={fmt} type="button" onClick={() => formatText(fmt)} className={`al-fmt-btn ${cls}`}>{lbl}</button>
                      ))}
                    </div>
                    <textarea name="content" value={formData.content} onChange={handleInputChange} onSelect={() => {}} rows={20} className="al-modal-inp" placeholder="Enter your legal document content here..." required style={{ fontFamily: 'monospace', fontSize: '13px' }} />
                    <p style={{ fontSize: '11px', color: 'var(--ink6)', marginTop: '6px' }}>Select text and use buttons above. Use # for large headings, ## for medium, ### for small. Use **bold** and *italic*.</p>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label className="al-modal-lbl">Language</label>
                      <select name="language" value={formData.language} onChange={handleInputChange} className="al-modal-inp">
                        <option value="en">English</option>
                      </select>
                    </div>
                    <div>
                      <label className="al-modal-lbl">Region</label>
                      <select name="region" value={formData.region} onChange={handleInputChange} className="al-modal-inp">
                        <option value="US">United States</option>
                      </select>
                    </div>
                  </div>

                  <div style={{ background: '#f9fafb', borderRadius: '10px', padding: '16px' }}>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                      <input type="checkbox" name="acceptanceRequired" checked={formData.acceptanceRequired} onChange={handleInputChange} style={{ marginTop: '2px', accentColor: 'var(--t4)' }} />
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>Require User Acceptance</span>
                        <p style={{ fontSize: '12px', color: 'var(--ink6)', marginTop: '2px' }}>Users must accept this document before using your service</p>
                      </div>
                    </label>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '12px', paddingTop: '20px', borderTop: '1px solid #e5e7eb' }}>
                    <button type="button" onClick={() => { setShowForm(false); setEditingDocument(null); resetForm(); }} className="btn btn-o">Cancel</button>
                    <button type="submit" disabled={loading} className="btn btn-d" style={{ opacity: loading ? 0.65 : 1 }}>
                      {loading ? 'Saving…' : editingDocument ? 'Update Document' : 'Create Document'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default AdminLegal;
