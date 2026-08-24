-- Remove presentation-only data labels from candidate-facing posting copy.
-- The environment may still use controlled fixtures without advertising or
-- classifying the submitted document in the public workflow.

update public.job_postings
set public_summary = 'Build reliable backend services for HireLens.'
where public_summary = 'Build reliable backend services for the synthetic HireLens demo.';

update public.job_postings
set public_summary = 'Improve deployment tooling and observability for HireLens.'
where public_summary = 'Improve deployment tooling and observability for the synthetic HireLens demo.';
