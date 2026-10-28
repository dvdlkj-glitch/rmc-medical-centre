-- Doctor list update, 28 October 2026 (RMC's updated specialist list).
-- Adds four specialists and two clinic services, changes the cardiac technician's
-- service from ECG to echocardiogram, and hides Dr. Cindy Chin Yeen Ling, who no
-- longer visits RMC (hidden rather than deleted, so she can be shown again).
-- Idempotent.

-- Clinic services without a named doctor (Physiotherapy, Health Screening) use type 'Service'.
alter table rmc_doctors drop constraint if exists rmc_doctors_doctor_type_check;
alter table rmc_doctors add constraint rmc_doctors_doctor_type_check
  check (doctor_type in ('Resident', 'Sessional', 'Visiting', 'Service'));

insert into rmc_doctors (slug, name, specialty, qualifications, expertise, doctor_type, sort_order) values
('tan-hai-siang', 'Dr. Tan Hai Siang', 'Anaesthesiologist',
 'Master in Anaesthesiology (Universiti Sains Malaysia), Medical Degree (Universiti Sains Malaysia), ACLS provider 2020',
 'Anaesthesiology; Regional anaesthesia; Critical care; Neuroanaesthesia; Obstetric anaesthesia', 'Visiting', 15),
('ahmad-nordin-afandi', 'Dr. Ahmad Nordin Bin Afandi', 'Ear, Nose & Throat (ENT) Surgeon',
 'MBBS (University of Malaya), Master of Otorhinolaryngology, Head and Neck Surgery (University of Malaya)',
 'Ear disease assessment, cleaning & suction; Hearing loss & vertigo assessment; Snoring & sleep apnoea assessment and treatment; Sinus assessment and minimally invasive endoscopic sinus surgery; Tonsil & tongue conditions and surgery; Laryngeal disease assessment & treatment; ENT care for children; Head & neck tumour screening and surgery', 'Sessional', 55),
('seng-kit-ling', 'Dr. Seng Kit Ling', 'General Surgeon',
 'MD (UPM), Master of Surgery (Universiti Malaya)',
 'General & gastrointestinal surgery; Laparoscopic (minimally invasive) surgery; Hepatobiliary & pancreatic surgery; Colorectal & anal surgery; Diagnostic & therapeutic endoscopy', 'Visiting', 115),
('ahmad-hazwan-roodzi', 'Dr. Ahmad Hazwan Bin Mohd Roodzi', 'Radiologist',
 null,
 'Diagnostic imaging & sonographic evaluation; Acute scrotal pain management; Diagnostic radiology; Imaging; Neuroradiology', 'Visiting', 145),
('physiotherapy', 'Physiotherapy', 'Clinic service',
 null,
 'Specialised treatment and rehabilitation training to help relieve pain, improve mobility and promote the recovery of bodily functions', 'Service', 330),
('health-screening', 'Health Screening / Medical Check-up', 'Clinic service',
 null,
 'Health screening & blood tests', 'Service', 340)
on conflict (slug) do nothing;

update rmc_doctors
   set specialty = 'Cardiac Technician (ECHO)', expertise = 'Echo-cardiogram (ECHO)'
 where slug = 'jemes-bala-muga';

update rmc_doctors set active = false where slug = 'cindy-chin-yeen-ling';
