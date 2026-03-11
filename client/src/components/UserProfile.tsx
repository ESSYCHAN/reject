import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import './UserProfile.css';

interface UserProfileData {
  userId?: string;
  fullName?: string;
  currentTitle?: string;
  yearsExperience?: number;
  skills?: string[];
  cvText?: string;
  cvFilename?: string;
  targetRoles?: string[];
  targetCompanies?: string[];
  minSalary?: number;
}

// Common skills for suggestions
const SKILL_SUGGESTIONS = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'Go', 'Rust', 'C++',
  'React', 'Vue', 'Angular', 'Node.js', 'Express', 'Next.js',
  'SQL', 'PostgreSQL', 'MongoDB', 'Redis', 'GraphQL',
  'AWS', 'GCP', 'Azure', 'Docker', 'Kubernetes',
  'Machine Learning', 'Data Analysis', 'Product Management',
  'UI/UX Design', 'Figma', 'Git', 'Agile', 'Scrum'
];

export function UserProfile() {
  const { getToken } = useAuth();

  const [profile, setProfile] = useState<UserProfileData>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);
  const [customSkill, setCustomSkill] = useState('');
  const [rolesInput, setRolesInput] = useState('');
  const [companiesInput, setCompaniesInput] = useState('');

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const token = await getToken();
      const response = await fetch('/api/user/profile', {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('Failed to load profile');

      const data = await response.json();
      setProfile(data.profile || {});
      setSelectedSkills(data.profile?.skills || []);
      setRolesInput(data.profile?.targetRoles?.join(', ') || '');
      setCompaniesInput(data.profile?.targetCompanies?.join(', ') || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const token = await getToken();
      const targetRoles = rolesInput.split(',').map(s => s.trim()).filter(Boolean);
      const targetCompanies = companiesInput.split(',').map(s => s.trim()).filter(Boolean);

      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          fullName: profile.fullName,
          currentTitle: profile.currentTitle,
          yearsExperience: profile.yearsExperience,
          skills: selectedSkills,
          targetRoles,
          targetCompanies,
          minSalary: profile.minSalary
        })
      });

      if (!response.ok) throw new Error('Failed to save profile');

      const data = await response.json();
      setProfile(data.profile);
      setSuccess('Profile saved!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleCVUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.txt')) {
      setError('Currently only .txt files supported. PDF parsing coming soon!');
      return;
    }

    try {
      const text = await file.text();
      const token = await getToken();

      const response = await fetch('/api/user/profile/cv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          cvText: text,
          cvFilename: file.name
        })
      });

      if (!response.ok) throw new Error('Failed to upload CV');

      setSuccess('CV uploaded!');
      setProfile(prev => ({ ...prev, cvText: text, cvFilename: file.name }));
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload CV');
    }
  }

  function toggleSkill(skill: string) {
    setSelectedSkills(prev =>
      prev.includes(skill)
        ? prev.filter(s => s !== skill)
        : [...prev, skill]
    );
  }

  function addCustomSkill() {
    const skill = customSkill.trim();
    if (skill && !selectedSkills.includes(skill)) {
      setSelectedSkills(prev => [...prev, skill]);
      setCustomSkill('');
    }
  }

  function removeSkill(skill: string) {
    setSelectedSkills(prev => prev.filter(s => s !== skill));
  }

  if (loading) {
    return <div className="profile-loading">Loading profile...</div>;
  }

  return (
    <div className="profile-form">
      {error && <div className="profile-error">{error}</div>}
      {success && <div className="profile-success">{success}</div>}

      {/* Basic Info */}
      <section className="profile-section">
        <h3>Basic Info</h3>
        <div className="form-row">
          <label>
            Full Name
            <input
              type="text"
              value={profile.fullName || ''}
              onChange={e => setProfile({ ...profile, fullName: e.target.value })}
              placeholder="John Doe"
            />
          </label>
          <label>
            Current Title
            <input
              type="text"
              value={profile.currentTitle || ''}
              onChange={e => setProfile({ ...profile, currentTitle: e.target.value })}
              placeholder="Software Engineer"
            />
          </label>
        </div>
        <label className="experience-label">
          Years of Experience
          <input
            type="number"
            min="0"
            max="50"
            value={profile.yearsExperience || ''}
            onChange={e => setProfile({ ...profile, yearsExperience: parseInt(e.target.value) || undefined })}
            placeholder="3"
          />
        </label>
      </section>

      {/* Skills */}
      <section className="profile-section">
        <h3>Skills</h3>

        {/* Selected skills */}
        {selectedSkills.length > 0 && (
          <div className="selected-skills">
            {selectedSkills.map(skill => (
              <span key={skill} className="skill-tag selected">
                {skill}
                <button onClick={() => removeSkill(skill)} className="remove-skill">×</button>
              </span>
            ))}
          </div>
        )}

        {/* Skill suggestions */}
        <p className="skill-hint">Click to add skills:</p>
        <div className="skill-suggestions">
          {SKILL_SUGGESTIONS.filter(s => !selectedSkills.includes(s)).slice(0, 15).map(skill => (
            <button
              key={skill}
              className="skill-tag suggestion"
              onClick={() => toggleSkill(skill)}
            >
              + {skill}
            </button>
          ))}
        </div>

        {/* Custom skill */}
        <div className="custom-skill-row">
          <input
            type="text"
            value={customSkill}
            onChange={e => setCustomSkill(e.target.value)}
            placeholder="Add custom skill..."
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addCustomSkill())}
          />
          <button onClick={addCustomSkill} className="add-skill-btn">Add</button>
        </div>
      </section>

      {/* Job Preferences */}
      <section className="profile-section">
        <h3>Job Preferences</h3>
        <label>
          Target Roles
          <input
            type="text"
            value={rolesInput}
            onChange={e => setRolesInput(e.target.value)}
            placeholder="Software Engineer, Full Stack Developer"
          />
          <span className="input-hint">Separate multiple roles with commas</span>
        </label>
        <label>
          Dream Companies
          <input
            type="text"
            value={companiesInput}
            onChange={e => setCompaniesInput(e.target.value)}
            placeholder="Google, Stripe, Vercel"
          />
          <span className="input-hint">Separate multiple companies with commas</span>
        </label>
        <label>
          Minimum Salary
          <div className="salary-input">
            <span className="currency">$</span>
            <input
              type="number"
              min="0"
              step="5000"
              value={profile.minSalary || ''}
              onChange={e => setProfile({ ...profile, minSalary: parseInt(e.target.value) || undefined })}
              placeholder="80000"
            />
          </div>
        </label>
      </section>

      {/* CV Upload */}
      <section className="profile-section">
        <h3>Resume/CV</h3>
        <div className="cv-section">
          <div className="cv-status">
            {profile.cvFilename ? (
              <>
                <span className="cv-icon">✓</span>
                <span>Uploaded: <strong>{profile.cvFilename}</strong></span>
              </>
            ) : (
              <>
                <span className="cv-icon empty">○</span>
                <span>No CV uploaded yet</span>
              </>
            )}
          </div>
          <label className="cv-upload-btn">
            {profile.cvFilename ? 'Replace CV' : 'Upload CV'} (.txt)
            <input type="file" accept=".txt" onChange={handleCVUpload} style={{ display: 'none' }} />
          </label>
        </div>
        <p className="cv-hint">Upload your CV and we'll extract skills automatically (coming soon)</p>
      </section>

      {/* Save Button */}
      <button className="save-btn" onClick={saveProfile} disabled={saving}>
        {saving ? 'Saving...' : 'Save Profile'}
      </button>
    </div>
  );
}
