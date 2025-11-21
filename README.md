# Census API – Server Deployment CA
This is a Node.js / Express backend for a simple Census application.

- Admin authenticates using **HTTP Basic Auth**
- Admin can **create, read, update and delete** participants
- Data is stored in **MySQL** hosted on **Aiven.io**
- App is deployed to **Render.com**

---
## Live Deployment
**Render URL (base API URL):**

`https://server-deployment-ca-vyrt.onrender.com`

All endpoints below are relative to this base URL.

Example:

```bash
curl -u admin:P4ssword https://server-deployment-ca-vyrt.onrender.com/participants
