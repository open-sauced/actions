--
-- Data for Name: users_to_repos_submissions; Type: TABLE DATA; Schema: public; Timestamp: 2022-12-30T04:44:26.305Z
-- COPY users_to_repos_submissions(id, user_id, repo_id, created_at, updated_at, deleted_at, is_accepted) FROM 'users_to_repos_submissions.csv' WITH DELIMITER ',' CSV HEADER;
--

INSERT INTO users_to_repos_submissions(id, user_id, repo_id, created_at, updated_at, deleted_at, is_accepted) VALUES
(1, 5713670, 392073567, '2022-10-19T20:46:03.185186+00:00', '2022-10-19T20:46:03.185186+00:00', null, false);
