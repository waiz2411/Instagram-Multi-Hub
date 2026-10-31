import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db.js';

const router = express.Router();

// Get leads with optional filtering
router.get('/', (req, res) => {
  const { listName, status } = req.query;
  const leads = db.getLeads({ listName, status });
  res.json({ success: true, leads });
});

// Get unique lists and counts
router.get('/lists', (req, res) => {
  const leads = db.getLeads();
  const summary = {};
  for (const l of leads) {
    const name = l.listName || 'General';
    if (!summary[name]) {
      summary[name] = { name, total: 0, pending: 0, contacted: 0, failed: 0 };
    }
    summary[name].total += 1;
    if (l.status === 'pending') summary[name].pending += 1;
    else if (l.status === 'contacted') summary[name].contacted += 1;
    else if (l.status === 'failed') summary[name].failed += 1;
  }
  res.json({ success: true, lists: Object.values(summary) });
});

// Add single lead
router.post('/', (req, res) => {
  try {
    const { username, fullName, listName, notes } = req.body;
    if (!username) return res.status(400).json({ success: false, error: 'Username is required' });

    const cleanUsername = username.trim().replace('@', '');
    const lead = {
      id: uuidv4(),
      username: cleanUsername,
      fullName: (fullName || '').trim(),
      profileUrl: `https://www.instagram.com/${cleanUsername}/`,
      listName: (listName || 'General').trim(),
      status: 'pending',
      notes: notes || '',
      addedAt: new Date().toISOString()
    };

    db.addLead(lead);
    res.json({ success: true, lead });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk import leads
router.post('/import', (req, res) => {
  try {
    const { leads: rawLeads, listName, textData } = req.body;
    let leadsToAdd = [];
    const targetList = (listName || 'General').trim();

    if (Array.isArray(rawLeads)) {
      leadsToAdd = rawLeads.map(l => ({
        id: uuidv4(),
        username: (l.username || '').trim().replace('@', ''),
        fullName: (l.fullName || '').trim(),
        profileUrl: `https://www.instagram.com/${(l.username || '').trim().replace('@', '')}/`,
        listName: targetList,
        status: 'pending',
        notes: l.notes || '',
        addedAt: new Date().toISOString()
      }));
    } else if (typeof textData === 'string') {
      // Lines of text or CSV: "username" or "username, fullName"
      const lines = textData.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parts = trimmed.split(',').map(p => p.trim());
        const user = parts[0].replace('@', '');
        if (user) {
          leadsToAdd.push({
            id: uuidv4(),
            username: user,
            fullName: parts[1] || '',
            profileUrl: `https://www.instagram.com/${user}/`,
            listName: targetList,
            status: 'pending',
            notes: '',
            addedAt: new Date().toISOString()
          });
        }
      }
    }

    // Filter out invalid items
    leadsToAdd = leadsToAdd.filter(l => l.username.length > 0);

    db.addLeadsBulk(leadsToAdd);
    res.json({ success: true, count: leadsToAdd.length, listName: targetList });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update lead
router.put('/:id', (req, res) => {
  const updated = db.updateLead(req.params.id, req.body);
  if (!updated) return res.status(404).json({ success: false, error: 'Lead not found' });
  res.json({ success: true, lead: updated });
});

// Delete lead
router.delete('/:id', (req, res) => {
  db.deleteLead(req.params.id);
  res.json({ success: true, message: 'Lead deleted' });
});

// Clear entire list
router.delete('/list/:name', (req, res) => {
  db.clearLeadsByList(req.params.name);
  res.json({ success: true, message: `List ${req.params.name} cleared` });
});

export default router;
