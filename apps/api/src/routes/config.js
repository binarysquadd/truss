import express from "express";

export const router = express.Router();

// ─── SDK Snippets — served lazily when Developer tab opens ───────────────────
// Placeholders like {{baseUrl}}, {{kratosUrl}}, etc. are replaced client-side.

const AUTH_SNIPPETS = {
  login: {
    label: "Login",
    code: {
      js: `import { Configuration, FrontendApi } from "@ory/client"

const ory = new FrontendApi(new Configuration({
  basePath: "{{kratosUrl}}",
  baseOptions: { withCredentials: true },
}))

// Initialize login flow
const { data: flow } = await ory.createBrowserLoginFlow()

// Submit login
const { data: session } = await ory.updateLoginFlow({
  flow: flow.id,
  updateLoginFlowBody: {
    method: "password",
    identifier: "user@example.com",
    password: "secret123",
  },
})
console.log("Logged in:", session.identity.traits.email)`,
      python: `import ory_client

config = ory_client.Configuration(host="{{kratosUrl}}")
api = ory_client.FrontendApi(ory_client.ApiClient(config))

# Initialize login flow
flow = api.create_browser_login_flow()

# Submit login
session = api.update_login_flow(
    flow=flow.id,
    update_login_flow_body={
        "method": "password",
        "identifier": "user@example.com",
        "password": "secret123",
    },
)
print("Logged in:", session.identity.traits["email"])`,
      go: `import ory "github.com/ory/client-go"

config := ory.NewConfiguration()
config.Servers = []ory.ServerConfiguration{{URL: "{{kratosUrl}}"}}
client := ory.NewAPIClient(config)

// Initialize login flow
flow, _, _ := client.FrontendApi.CreateBrowserLoginFlow(ctx).Execute()

// Submit login
body := ory.UpdateLoginFlowBody{
    UpdateLoginFlowWithPasswordMethod: &ory.UpdateLoginFlowWithPasswordMethod{
        Method:     "password",
        Identifier: "user@example.com",
        Password:   "secret123",
    },
}
session, _, _ := client.FrontendApi.UpdateLoginFlow(ctx).
    Flow(flow.Id).UpdateLoginFlowBody(body).Execute()`,
      curl: `# Initialize login flow
FLOW=$(curl -s -X GET "{{kratosUrl}}/self-service/login/api" | jq -r '.id')

# Submit login
curl -s -X POST "{{kratosUrl}}/self-service/login?flow=$FLOW" \\
  -H "Content-Type: application/json" \\
  -d '{"method":"password","identifier":"user@example.com","password":"secret123"}'`,
    },
  },
  register: {
    label: "Register",
    code: {
      js: `const { data: flow } = await ory.createBrowserRegistrationFlow()

const { data: identity } = await ory.updateRegistrationFlow({
  flow: flow.id,
  updateRegistrationFlowBody: {
    method: "password",
    traits: { email: "new@example.com" },
    password: "securePassword123",
  },
})`,
      python: `flow = api.create_browser_registration_flow()

identity = api.update_registration_flow(
    flow=flow.id,
    update_registration_flow_body={
        "method": "password",
        "traits": {"email": "new@example.com"},
        "password": "securePassword123",
    },
)`,
      go: `flow, _, _ := client.FrontendApi.CreateBrowserRegistrationFlow(ctx).Execute()

body := ory.UpdateRegistrationFlowBody{
    UpdateRegistrationFlowWithPasswordMethod: &ory.UpdateRegistrationFlowWithPasswordMethod{
        Method:   "password",
        Traits:   map[string]interface{}{"email": "new@example.com"},
        Password: "securePassword123",
    },
}
identity, _, _ := client.FrontendApi.UpdateRegistrationFlow(ctx).
    Flow(flow.Id).UpdateRegistrationFlowBody(body).Execute()`,
      curl: `FLOW=$(curl -s "{{kratosUrl}}/self-service/registration/api" | jq -r '.id')

curl -s -X POST "{{kratosUrl}}/self-service/registration?flow=$FLOW" \\
  -H "Content-Type: application/json" \\
  -d '{"method":"password","traits":{"email":"new@example.com"},"password":"securePassword123"}'`,
    },
  },
  session: {
    label: "Session",
    code: {
      js: `// Check current session
const { data: session } = await ory.toSession()
console.log("User:", session.identity.traits.email)
console.log("Authenticated at:", session.authenticated_at)`,
      python: `session = api.to_session()
print("User:", session.identity.traits["email"])`,
      go: `session, _, _ := client.FrontendApi.ToSession(ctx).Execute()
fmt.Println("User:", session.Identity.Traits.(map[string]interface{})["email"])`,
      curl: `curl -s "{{kratosUrl}}/sessions/whoami" \\
  -H "Cookie: ory_session_...=<session_cookie>"`,
    },
  },
  verify: {
    label: "Verify Email",
    code: {
      js: `// Send verification email
const { data: flow } = await ory.createBrowserVerificationFlow()
await ory.updateVerificationFlow({
  flow: flow.id,
  updateVerificationFlowBody: {
    method: "code",
    email: "user@example.com",
  },
})`,
      python: `flow = api.create_browser_verification_flow()
api.update_verification_flow(
    flow=flow.id,
    update_verification_flow_body={"method": "code", "email": "user@example.com"},
)`,
      go: `flow, _, _ := client.FrontendApi.CreateBrowserVerificationFlow(ctx).Execute()`,
      curl: `curl -s -X POST "{{kratosUrl}}/self-service/verification?flow=FLOW_ID" \\
  -H "Content-Type: application/json" -d '{"method":"code","email":"user@example.com"}'`,
    },
  },
  recovery: {
    label: "Recovery",
    code: {
      js: `const { data: flow } = await ory.createBrowserRecoveryFlow()
await ory.updateRecoveryFlow({
  flow: flow.id,
  updateRecoveryFlowBody: {
    method: "code",
    email: "user@example.com",
  },
})`,
      python: `flow = api.create_browser_recovery_flow()
api.update_recovery_flow(
    flow=flow.id,
    update_recovery_flow_body={"method": "code", "email": "user@example.com"},
)`,
      go: `flow, _, _ := client.FrontendApi.CreateBrowserRecoveryFlow(ctx).Execute()`,
      curl: `curl -s -X POST "{{kratosUrl}}/self-service/recovery?flow=FLOW_ID" \\
  -H "Content-Type: application/json" -d '{"method":"code","email":"user@example.com"}'`,
    },
  },
  component: {
    label: "React Component",
    code: {
      js: `// React component with Ory Elements
import { SessionProvider, useSession, Login, Registration } from "@ory/elements"

function App() {
  return (
    <SessionProvider basePath="{{kratosUrl}}">
      <AuthPage />
    </SessionProvider>
  )
}

function AuthPage() {
  const { session, error } = useSession()
  if (session) return <p>Welcome, {session.identity.traits.email}</p>
  return <Login onSuccess={() => window.location.reload()} />
}`,
      python: `# Python: Use the REST API directly
# No component library — render forms server-side`,
      go: `// Go: Use the REST API directly
// No component library — render forms server-side`,
      curl: `# cURL: No SDK components — use raw HTTP calls`,
    },
  },
};

const AUTHZ_SNIPPETS = {
  check: {
    label: "Check Permission",
    code: {
      js: `import { Configuration, PermissionApi, RelationshipApi } from "@ory/client"

const ory = new PermissionApi(new Configuration({
  basePath: "{{ketoUrl}}",
}))

// Check if user has "view" access on document
const { data } = await ory.checkPermission({
  namespace: "documents",
  object: "doc_123",
  relation: "view",
  subjectId: "user_456",
})
console.log("Allowed:", data.allowed)`,
      python: `import ory_client

config = ory_client.Configuration(host="{{ketoUrl}}")
api = ory_client.PermissionApi(ory_client.ApiClient(config))

# Check if user has "view" access on document
result = api.check_permission(
    namespace="documents",
    object="doc_123",
    relation="view",
    subject_id="user_456",
)
print("Allowed:", result.allowed)`,
      go: `import ory "github.com/ory/client-go"

config := ory.NewConfiguration()
config.Servers = []ory.ServerConfiguration{{URL: "{{ketoUrl}}"}}
client := ory.NewAPIClient(config)

// Check if user has "view" access on document
result, _, _ := client.PermissionApi.CheckPermission(ctx).
    Namespace("documents").
    Object("doc_123").
    Relation("view").
    SubjectId("user_456").
    Execute()
fmt.Println("Allowed:", *result.Allowed)`,
      curl: `# Check permission
curl -s "{{ketoUrl}}/relation-tuples/check" \\
  -H "Content-Type: application/json" \\
  -d '{
    "namespace": "documents",
    "object": "doc_123",
    "relation": "view",
    "subject_id": "user_456"
  }'`,
    },
  },
  create: {
    label: "Create Tuple",
    code: {
      js: `// Create a relation tuple (grant permission)
const { data } = await ory.createRelationship({
  createRelationshipBody: {
    namespace: "documents",
    object: "doc_123",
    relation: "editor",
    subject_id: "user_456",
  },
})
console.log("Tuple created:", data)`,
      python: `# Create a relation tuple (grant permission)
result = api.create_relationship(
    create_relationship_body={
        "namespace": "documents",
        "object": "doc_123",
        "relation": "editor",
        "subject_id": "user_456",
    },
)
print("Tuple created:", result)`,
      go: `// Create a relation tuple (grant permission)
body := ory.CreateRelationshipBody{
    Namespace: ory.PtrString("documents"),
    Object:    ory.PtrString("doc_123"),
    Relation:  ory.PtrString("editor"),
    SubjectId: ory.PtrString("user_456"),
}
result, _, _ := client.RelationshipApi.CreateRelationship(ctx).
    CreateRelationshipBody(body).Execute()`,
      curl: `# Create a relation tuple
curl -s -X PUT "{{ketoUrl}}/admin/relation-tuples" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \\
  -d '{
    "namespace": "documents",
    "object": "doc_123",
    "relation": "editor",
    "subject_id": "user_456"
  }'`,
    },
  },
  list: {
    label: "List Tuples",
    code: {
      js: `// List all relation tuples in a namespace
const { data } = await ory.getRelationships({
  namespace: "documents",
})
for (const tuple of data.relation_tuples || []) {
  console.log(\`\${tuple.object}#\${tuple.relation}@\${tuple.subject_id || tuple.subject_set?.object}\`)
}`,
      python: `# List all relation tuples in a namespace
result = api.get_relationships(namespace="documents")
for t in result.relation_tuples or []:
    subject = t.subject_id or t.subject_set.object
    print(f"{t.object}#{t.relation}@{subject}")`,
      go: `// List all relation tuples in a namespace
result, _, _ := client.RelationshipApi.GetRelationships(ctx).
    Namespace("documents").Execute()
for _, t := range result.RelationTuples {
    fmt.Printf("%s#%s@%s\\n", *t.Object, *t.Relation, *t.SubjectId)
}`,
      curl: `# List relation tuples
curl -s "{{ketoUrl}}/relation-tuples?namespace=documents"`,
    },
  },
  expand: {
    label: "Expand Tree",
    code: {
      js: `// Expand the permission tree for a resource
const { data } = await ory.expandPermissions({
  namespace: "documents",
  object: "doc_123",
  relation: "view",
  maxDepth: 3,
})
console.log("Permission tree:", JSON.stringify(data, null, 2))`,
      python: `# Expand the permission tree for a resource
result = api.expand_permissions(
    namespace="documents",
    object="doc_123",
    relation="view",
    max_depth=3,
)
print("Permission tree:", result)`,
      go: `result, _, _ := client.PermissionApi.ExpandPermissions(ctx).
    Namespace("documents").
    Object("doc_123").
    Relation("view").
    MaxDepth(3).
    Execute()`,
      curl: `# Expand the permission tree
curl -s "{{ketoUrl}}/relation-tuples/expand?namespace=documents&object=doc_123&relation=view&max-depth=3"`,
    },
  },
  "subject-set": {
    label: "Group Membership",
    code: {
      js: `// Grant permission via group membership (subject set)
// First: make user a member of the editors group
await ory.createRelationship({
  createRelationshipBody: {
    namespace: "groups",
    object: "editors",
    relation: "member",
    subject_id: "user_456",
  },
})

// Then: grant the editors group access to the document
await ory.createRelationship({
  createRelationshipBody: {
    namespace: "documents",
    object: "doc_123",
    relation: "editor",
    subject_set: {
      namespace: "groups",
      object: "editors",
      relation: "member",
    },
  },
})`,
      python: `# Grant permission via group membership (subject set)
# Make user a member of the editors group
api.create_relationship(create_relationship_body={
    "namespace": "groups",
    "object": "editors",
    "relation": "member",
    "subject_id": "user_456",
})

# Grant the editors group access to the document
api.create_relationship(create_relationship_body={
    "namespace": "documents",
    "object": "doc_123",
    "relation": "editor",
    "subject_set": {
        "namespace": "groups",
        "object": "editors",
        "relation": "member",
    },
})`,
      go: `// Grant permission via group — subject set
memberBody := ory.CreateRelationshipBody{
    Namespace: ory.PtrString("groups"),
    Object:    ory.PtrString("editors"),
    Relation:  ory.PtrString("member"),
    SubjectId: ory.PtrString("user_456"),
}
client.RelationshipApi.CreateRelationship(ctx).
    CreateRelationshipBody(memberBody).Execute()

// Grant editors group access via subject set
accessBody := ory.CreateRelationshipBody{
    Namespace: ory.PtrString("documents"),
    Object:    ory.PtrString("doc_123"),
    Relation:  ory.PtrString("editor"),
    SubjectSet: &ory.SubjectSet{
        Namespace: "groups",
        Object:    "editors",
        Relation:  "member",
    },
}
client.RelationshipApi.CreateRelationship(ctx).
    CreateRelationshipBody(accessBody).Execute()`,
      curl: `# Step 1: Make user a member of editors group
curl -s -X PUT "{{ketoUrl}}/admin/relation-tuples" \\
  -H "Content-Type: application/json" \\
  -d '{"namespace":"groups","object":"editors","relation":"member","subject_id":"user_456"}'

# Step 2: Grant editors group access via subject set
curl -s -X PUT "{{ketoUrl}}/admin/relation-tuples" \\
  -H "Content-Type: application/json" \\
  -d '{
    "namespace": "documents",
    "object": "doc_123",
    "relation": "editor",
    "subject_set": {"namespace":"groups","object":"editors","relation":"member"}
  }'`,
    },
  },
  opl: {
    label: "OPL Model",
    code: {
      js: `// Ory Permission Language (OPL) — TypeScript-based model
// Define your permission model in .ts files

import { Namespace, Context } from "@ory/keto-namespace-types"

class User implements Namespace {}

class Document implements Namespace {
  related: {
    owners: User[]
    editors: User[]
    viewers: User[]
  }

  permits = {
    view: (ctx: Context) =>
      this.related.viewers.includes(ctx.subject) ||
      this.permits.edit(ctx),

    edit: (ctx: Context) =>
      this.related.editors.includes(ctx.subject) ||
      this.permits.delete(ctx),

    delete: (ctx: Context) =>
      this.related.owners.includes(ctx.subject),
  }
}`,
      python: `# OPL (Ory Permission Language) is TypeScript-based
# Python apps interact via the REST API, not OPL directly
#
# Example: Check derived permissions defined by OPL model
import requests

# The OPL model defines that "viewers" can "view",
# and "editors" can also "view" (inherited permission)
resp = requests.post("{{ketoUrl}}/relation-tuples/check", json={
    "namespace": "Document",
    "object": "doc_123",
    "relation": "view",  # This checks the OPL permits.view rule
    "subject_id": "user_456",
})
print("Allowed:", resp.json().get("allowed"))`,
      go: `// OPL is TypeScript-based — Go apps interact via REST API
// The OPL model on the server defines permission inheritance
//
// Example OPL model (deployed to Keto):
//
//   class Document implements Namespace {
//     related: { owners: User[], editors: User[], viewers: User[] }
//     permits = {
//       view: (ctx) => this.related.viewers.includes(ctx.subject)
//                    || this.permits.edit(ctx),
//       edit: (ctx) => this.related.editors.includes(ctx.subject),
//     }
//   }
//
// Go client checks against the deployed model:
result, _, _ := client.PermissionApi.CheckPermission(ctx).
    Namespace("Document").Object("doc_123").
    Relation("view").SubjectId("user_456").Execute()`,
      curl: `# OPL models are deployed via Keto admin API
# Upload your .ts permission model:
curl -s -X PUT "{{ketoUrl}}/opl" \\
  -H "Content-Type: text/plain" \\
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \\
  --data-binary @permissions.ts

# Then check permissions defined by the model:
curl -s -X POST "{{ketoUrl}}/relation-tuples/check" \\
  -H "Content-Type: application/json" \\
  -d '{"namespace":"Document","object":"doc_123","relation":"view","subject_id":"user_456"}'`,
    },
  },
};

const AUTHZ_OPL_TEMPLATES = {
  rbac: {
    label: "RBAC (Role-Based)",
    description: "Users assigned to roles, roles grant permissions on resources",
    opl: `class User implements Namespace {}

class Role implements Namespace {
  related: {
    members: User[]
  }
}

class Document implements Namespace {
  related: {
    owners: User[]
    editors: Role[]
    viewers: (User | Role)[]
  }

  permits: {
    edit: (ctx: Context) => this.related.owners.includes(ctx.subject) ||
      this.related.editors.includes(ctx.subject)
    view: (ctx: Context) => this.permits.edit(ctx) ||
      this.related.viewers.includes(ctx.subject)
  }
}`,
  },
  multi_tenant: {
    label: "Multi-Tenant",
    description: "Organization-scoped resources with team hierarchy",
    opl: `class User implements Namespace {}

class Organization implements Namespace {
  related: {
    admins: User[]
    members: User[]
  }
}

class Project implements Namespace {
  related: {
    org: Organization[]
    managers: User[]
    contributors: User[]
  }

  permits: {
    manage: (ctx: Context) =>
      this.related.managers.includes(ctx.subject) ||
      this.related.org.traverse((o) => o.related.admins.includes(ctx.subject))
    contribute: (ctx: Context) =>
      this.permits.manage(ctx) ||
      this.related.contributors.includes(ctx.subject) ||
      this.related.org.traverse((o) => o.related.members.includes(ctx.subject))
  }
}`,
  },
  google_docs: {
    label: "Google Docs Style",
    description: "Files in folders with inherited permissions + sharing links",
    opl: `class User implements Namespace {}

class Folder implements Namespace {
  related: {
    owners: User[]
    editors: User[]
    viewers: User[]
    parent: Folder[]
  }

  permits: {
    edit: (ctx: Context) =>
      this.related.owners.includes(ctx.subject) ||
      this.related.editors.includes(ctx.subject) ||
      this.related.parent.traverse((p) => p.permits.edit(ctx))
    view: (ctx: Context) =>
      this.permits.edit(ctx) ||
      this.related.viewers.includes(ctx.subject) ||
      this.related.parent.traverse((p) => p.permits.view(ctx))
  }
}

class File implements Namespace {
  related: {
    owners: User[]
    editors: User[]
    viewers: User[]
    parent: Folder[]
  }

  permits: {
    edit: (ctx: Context) =>
      this.related.owners.includes(ctx.subject) ||
      this.related.editors.includes(ctx.subject) ||
      this.related.parent.traverse((p) => p.permits.edit(ctx))
    view: (ctx: Context) =>
      this.permits.edit(ctx) ||
      this.related.viewers.includes(ctx.subject) ||
      this.related.parent.traverse((p) => p.permits.view(ctx))
  }
}`,
  },
};

const OAUTH2_SNIPPETS = {
  "auth-code": {
    label: "Authorization Code",
    code: {
      js: `// OAuth2 Authorization Code Flow
// Step 1: Redirect user to authorization endpoint
const authUrl = new URL("{{hydraUrl}}/oauth2/auth")
authUrl.searchParams.set("client_id", "my-app")
authUrl.searchParams.set("response_type", "code")
authUrl.searchParams.set("redirect_uri", "https://myapp.com/callback")
authUrl.searchParams.set("scope", "openid profile email")
authUrl.searchParams.set("state", crypto.randomUUID())
window.location.href = authUrl.toString()

// Step 2: Exchange code for tokens (server-side)
const resp = await fetch("{{hydraUrl}}/oauth2/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    grant_type: "authorization_code",
    code: "AUTHORIZATION_CODE",
    redirect_uri: "https://myapp.com/callback",
    client_id: "my-app",
    client_secret: "my-secret",
  }),
})
const tokens = await resp.json()
console.log("Access Token:", tokens.access_token)`,
      python: `import requests
from urllib.parse import urlencode

# Step 1: Build authorization URL
params = urlencode({
    "client_id": "my-app",
    "response_type": "code",
    "redirect_uri": "https://myapp.com/callback",
    "scope": "openid profile email",
    "state": "random-state-value",
})
auth_url = f"{{hydraUrl}}/oauth2/auth?{params}"
# Redirect user to auth_url

# Step 2: Exchange code for tokens
resp = requests.post("{{hydraUrl}}/oauth2/token", data={
    "grant_type": "authorization_code",
    "code": "AUTHORIZATION_CODE",
    "redirect_uri": "https://myapp.com/callback",
    "client_id": "my-app",
    "client_secret": "my-secret",
})
tokens = resp.json()
print("Access Token:", tokens["access_token"])`,
      go: `import "golang.org/x/oauth2"

config := &oauth2.Config{
    ClientID:     "my-app",
    ClientSecret: "my-secret",
    Endpoint: oauth2.Endpoint{
        AuthURL:  "{{hydraUrl}}/oauth2/auth",
        TokenURL: "{{hydraUrl}}/oauth2/token",
    },
    RedirectURL: "https://myapp.com/callback",
    Scopes:      []string{"openid", "profile", "email"},
}

// Step 1: Redirect to authorization URL
url := config.AuthCodeURL("random-state")
// http.Redirect(w, r, url, http.StatusFound)

// Step 2: Exchange code for token
token, _ := config.Exchange(ctx, "AUTHORIZATION_CODE")
fmt.Println("Access Token:", token.AccessToken)`,
      curl: `# Step 1: Open this URL in browser
echo "{{hydraUrl}}/oauth2/auth?client_id=my-app&response_type=code&redirect_uri=https://myapp.com/callback&scope=openid+profile+email&state=random"

# Step 2: Exchange authorization code for tokens
curl -s -X POST "{{hydraUrl}}/oauth2/token" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=authorization_code" \\
  -d "code=AUTHORIZATION_CODE" \\
  -d "redirect_uri=https://myapp.com/callback" \\
  -d "client_id=my-app" \\
  -d "client_secret=my-secret"`,
    },
  },
  "client-credentials": {
    label: "Client Credentials",
    code: {
      js: `// Client Credentials Flow (machine-to-machine)
const resp = await fetch("{{hydraUrl}}/oauth2/token", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: "Basic " + btoa("client-id:client-secret"),
  },
  body: new URLSearchParams({
    grant_type: "client_credentials",
    scope: "api:read api:write",
  }),
})
const { access_token } = await resp.json()

// Use the token for API calls
const data = await fetch("https://api.example.com/data", {
  headers: { Authorization: \`Bearer \${access_token}\` },
}).then(r => r.json())`,
      python: `import requests
from requests.auth import HTTPBasicAuth

# Client Credentials Flow (machine-to-machine)
resp = requests.post(
    "{{hydraUrl}}/oauth2/token",
    auth=HTTPBasicAuth("client-id", "client-secret"),
    data={
        "grant_type": "client_credentials",
        "scope": "api:read api:write",
    },
)
access_token = resp.json()["access_token"]

# Use the token for API calls
data = requests.get("https://api.example.com/data",
    headers={"Authorization": f"Bearer {access_token}"}
).json()`,
      go: `config := &clientcredentials.Config{
    ClientID:     "client-id",
    ClientSecret: "client-secret",
    TokenURL:     "{{hydraUrl}}/oauth2/token",
    Scopes:       []string{"api:read", "api:write"},
}

// Get token (auto-refreshes)
token, _ := config.Token(ctx)
fmt.Println("Access Token:", token.AccessToken)

// Use token for HTTP client
httpClient := config.Client(ctx)
resp, _ := httpClient.Get("https://api.example.com/data")`,
      curl: `# Client Credentials Flow
curl -s -X POST "{{hydraUrl}}/oauth2/token" \\
  -u "client-id:client-secret" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "grant_type=client_credentials&scope=api:read+api:write"`,
    },
  },
  "create-client": {
    label: "Create Client",
    code: {
      js: `// Create an OAuth2 client (admin endpoint)
const resp = await fetch("{{hydraAdminUrl}}/admin/clients", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer ADMIN_TOKEN",
  },
  body: JSON.stringify({
    client_name: "My Application",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    scope: "openid profile email",
    redirect_uris: ["https://myapp.com/callback"],
    token_endpoint_auth_method: "client_secret_post",
  }),
})
const client = await resp.json()
console.log("Client ID:", client.client_id)
console.log("Client Secret:", client.client_secret)`,
      python: `import requests

# Create an OAuth2 client
resp = requests.post("{{hydraAdminUrl}}/admin/clients",
    headers={"Authorization": "Bearer ADMIN_TOKEN"},
    json={
        "client_name": "My Application",
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "scope": "openid profile email",
        "redirect_uris": ["https://myapp.com/callback"],
        "token_endpoint_auth_method": "client_secret_post",
    },
)
client = resp.json()
print("Client ID:", client["client_id"])`,
      go: `body := ory.OAuth2Client{
    ClientName:              ory.PtrString("My Application"),
    GrantTypes:              []string{"authorization_code", "refresh_token"},
    ResponseTypes:           []string{"code"},
    Scope:                   ory.PtrString("openid profile email"),
    RedirectUris:            []string{"https://myapp.com/callback"},
    TokenEndpointAuthMethod: ory.PtrString("client_secret_post"),
}
client, _, _ := adminClient.OAuth2Api.CreateOAuth2Client(ctx).
    OAuth2Client(body).Execute()
fmt.Println("Client ID:", *client.ClientId)`,
      curl: `# Create an OAuth2 client
curl -s -X POST "{{hydraAdminUrl}}/admin/clients" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ADMIN_TOKEN" \\
  -d '{
    "client_name": "My Application",
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "scope": "openid profile email",
    "redirect_uris": ["https://myapp.com/callback"]
  }'`,
    },
  },
  introspect: {
    label: "Introspect Token",
    code: {
      js: `// Introspect an access token (validate + get metadata)
const resp = await fetch("{{hydraAdminUrl}}/admin/oauth2/introspect", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ token: "ACCESS_TOKEN" }),
})
const info = await resp.json()
if (info.active) {
  console.log("Token is valid")
  console.log("Subject:", info.sub)
  console.log("Scopes:", info.scope)
  console.log("Expires:", new Date(info.exp * 1000))
} else {
  console.log("Token is expired or invalid")
}`,
      python: `# Introspect an access token
resp = requests.post(
    "{{hydraAdminUrl}}/admin/oauth2/introspect",
    data={"token": "ACCESS_TOKEN"},
)
info = resp.json()
if info.get("active"):
    print("Subject:", info["sub"])
    print("Scopes:", info["scope"])
else:
    print("Token is expired or invalid")`,
      go: `result, _, _ := adminClient.OAuth2Api.IntrospectOAuth2Token(ctx).
    Token("ACCESS_TOKEN").Execute()
if *result.Active {
    fmt.Println("Subject:", *result.Sub)
    fmt.Println("Scopes:", *result.Scope)
}`,
      curl: `# Introspect token
curl -s -X POST "{{hydraAdminUrl}}/admin/oauth2/introspect" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "token=ACCESS_TOKEN"`,
    },
  },
  revoke: {
    label: "Revoke Token",
    code: {
      js: `// Revoke an access or refresh token
await fetch("{{hydraUrl}}/oauth2/revoke", {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Authorization: "Basic " + btoa("client-id:client-secret"),
  },
  body: new URLSearchParams({ token: "TOKEN_TO_REVOKE" }),
})
console.log("Token revoked successfully")`,
      python: `# Revoke a token
requests.post(
    "{{hydraUrl}}/oauth2/revoke",
    auth=("client-id", "client-secret"),
    data={"token": "TOKEN_TO_REVOKE"},
)
print("Token revoked successfully")`,
      go: `adminClient.OAuth2Api.RevokeOAuth2Token(ctx).
    Token("TOKEN_TO_REVOKE").Execute()`,
      curl: `# Revoke a token
curl -s -X POST "{{hydraUrl}}/oauth2/revoke" \\
  -u "client-id:client-secret" \\
  -H "Content-Type: application/x-www-form-urlencoded" \\
  -d "token=TOKEN_TO_REVOKE"`,
    },
  },
  userinfo: {
    label: "UserInfo",
    code: {
      js: `// Get user info from OIDC endpoint
const resp = await fetch("{{hydraUrl}}/userinfo", {
  headers: { Authorization: \`Bearer \${accessToken}\` },
})
const user = await resp.json()
console.log("Email:", user.email)
console.log("Name:", user.name)
console.log("Subject:", user.sub)`,
      python: `# Get user info from OIDC endpoint
resp = requests.get("{{hydraUrl}}/userinfo",
    headers={"Authorization": f"Bearer {access_token}"}
)
user = resp.json()
print("Email:", user["email"])
print("Name:", user.get("name"))`,
      go: `req, _ := http.NewRequest("GET", "{{hydraUrl}}/userinfo", nil)
req.Header.Set("Authorization", "Bearer "+accessToken)
resp, _ := http.DefaultClient.Do(req)
var user map[string]interface{}
json.NewDecoder(resp.Body).Decode(&user)`,
      curl: `# Get user info
curl -s "{{hydraUrl}}/userinfo" \\
  -H "Authorization: Bearer ACCESS_TOKEN"`,
    },
  },
};

const GATEWAY_SNIPPETS = {
  "list-rules": {
    label: "List Rules",
    code: {
      js: `// List all access rules
const resp = await fetch("{{gatewayAdminUrl}}/rules", {
  headers: { Authorization: "Bearer ADMIN_TOKEN" },
})
const rules = await resp.json()
for (const rule of rules) {
  console.log(\`[\${rule.id}] \${rule.match.methods.join(",")} \${rule.match.url}\`)
  console.log("  Auth:", rule.authenticators?.map(a => a.handler).join(", "))
  console.log("  Authz:", rule.authorizer?.handler)
}`,
      python: `import requests

# List all access rules
resp = requests.get("{{gatewayAdminUrl}}/rules",
    headers={"Authorization": "Bearer ADMIN_TOKEN"})
rules = resp.json()
for rule in rules:
    methods = ",".join(rule["match"]["methods"])
    print(f"[{rule['id']}] {methods} {rule['match']['url']}")`,
      go: `req, _ := http.NewRequest("GET", "{{gatewayAdminUrl}}/rules", nil)
req.Header.Set("Authorization", "Bearer ADMIN_TOKEN")
resp, _ := http.DefaultClient.Do(req)
var rules []map[string]interface{}
json.NewDecoder(resp.Body).Decode(&rules)`,
      curl: `# List all access rules
curl -s "{{gatewayAdminUrl}}/rules" \\
  -H "Authorization: Bearer ADMIN_TOKEN" | jq '.[] | {id, match}'`,
    },
  },
  "create-rule": {
    label: "Create Rule",
    code: {
      js: `// Create or update an access rule
const rule = {
  id: "api-public-health",
  match: {
    url: "https://api.example.com/health",
    methods: ["GET"],
  },
  authenticators: [{ handler: "noop" }],
  authorizer: { handler: "allow" },
  mutators: [{ handler: "noop" }],
}

const resp = await fetch("{{gatewayAdminUrl}}/rules", {
  method: "PUT",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer ADMIN_TOKEN",
  },
  body: JSON.stringify(rule),
})
console.log("Rule saved:", (await resp.json()).id)`,
      python: `import requests

rule = {
    "id": "api-public-health",
    "match": {
        "url": "https://api.example.com/health",
        "methods": ["GET"],
    },
    "authenticators": [{"handler": "noop"}],
    "authorizer": {"handler": "allow"},
    "mutators": [{"handler": "noop"}],
}
resp = requests.put("{{gatewayAdminUrl}}/rules",
    headers={"Authorization": "Bearer ADMIN_TOKEN"},
    json=rule)
print("Rule saved:", resp.json()["id"])`,
      go: `rule := map[string]interface{}{
    "id": "api-public-health",
    "match": map[string]interface{}{
        "url":     "https://api.example.com/health",
        "methods": []string{"GET"},
    },
    "authenticators": []map[string]interface{}{{"handler": "noop"}},
    "authorizer":     map[string]interface{}{"handler": "allow"},
    "mutators":       []map[string]interface{}{{"handler": "noop"}},
}
body, _ := json.Marshal(rule)
req, _ := http.NewRequest("PUT", "{{gatewayAdminUrl}}/rules",
    bytes.NewReader(body))
req.Header.Set("Content-Type", "application/json")
req.Header.Set("Authorization", "Bearer ADMIN_TOKEN")
resp, _ := http.DefaultClient.Do(req)`,
      curl: `# Create or update an access rule
curl -s -X PUT "{{gatewayAdminUrl}}/rules" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ADMIN_TOKEN" \\
  -d '{
    "id": "api-public-health",
    "match": {"url": "https://api.example.com/health", "methods": ["GET"]},
    "authenticators": [{"handler": "noop"}],
    "authorizer": {"handler": "allow"},
    "mutators": [{"handler": "noop"}]
  }'`,
    },
  },
  "jwt-rule": {
    label: "JWT Auth Rule",
    code: {
      js: `// Rule with JWT authentication + header mutation
const rule = {
  id: "api-protected-resources",
  match: {
    url: "https://api.example.com/api/<**>",
    methods: ["GET", "POST", "PUT", "DELETE"],
  },
  authenticators: [{
    handler: "jwt",
    config: {
      jwks_urls: ["{{hydraPublicUrl}}/.well-known/jwks.json"],
      required_scope: ["api:read"],
    },
  }],
  authorizer: { handler: "allow" },
  mutators: [{
    handler: "header",
    config: {
      headers: {
        "X-User-Id": "{{ print .Subject }}",
        "X-User-Email": '{{ print .Extra.email }}',
      },
    },
  }],
}`,
      python: `# JWT authenticated rule with header mutation
rule = {
    "id": "api-protected-resources",
    "match": {
        "url": "https://api.example.com/api/<**>",
        "methods": ["GET", "POST", "PUT", "DELETE"],
    },
    "authenticators": [{
        "handler": "jwt",
        "config": {
            "jwks_urls": ["{{hydraPublicUrl}}/.well-known/jwks.json"],
            "required_scope": ["api:read"],
        },
    }],
    "authorizer": {"handler": "allow"},
    "mutators": [{
        "handler": "header",
        "config": {
            "headers": {
                "X-User-Id": "{{ print .Subject }}",
            },
        },
    }],
}
requests.put("{{gatewayAdminUrl}}/rules",
    headers={"Authorization": "Bearer ADMIN_TOKEN"}, json=rule)`,
      go: `// JWT auth rule — Go struct equivalent
rule := map[string]interface{}{
    "id": "api-protected-resources",
    "match": map[string]interface{}{
        "url":     "https://api.example.com/api/<**>",
        "methods": []string{"GET", "POST", "PUT", "DELETE"},
    },
    "authenticators": []map[string]interface{}{{
        "handler": "jwt",
        "config": map[string]interface{}{
            "jwks_urls":      []string{"{{hydraPublicUrl}}/.well-known/jwks.json"},
            "required_scope": []string{"api:read"},
        },
    }},
    "authorizer": map[string]interface{}{"handler": "allow"},
    "mutators": []map[string]interface{}{{
        "handler": "header",
        "config": map[string]interface{}{
            "headers": map[string]string{
                "X-User-Id": "{{ print .Subject }}",
            },
        },
    }},
}`,
      curl: `# JWT authenticated rule with header mutation
curl -s -X PUT "{{gatewayAdminUrl}}/rules" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ADMIN_TOKEN" \\
  -d '{
    "id": "api-protected-resources",
    "match": {"url": "https://api.example.com/api/<**>", "methods": ["GET","POST","PUT","DELETE"]},
    "authenticators": [{"handler": "jwt", "config": {"jwks_urls": ["{{hydraPublicUrl}}/.well-known/jwks.json"]}}],
    "authorizer": {"handler": "allow"},
    "mutators": [{"handler": "header", "config": {"headers": {"X-User-Id": "{{ print .Subject }}"}}}]
  }'`,
    },
  },
  judge: {
    label: "Test Decision",
    code: {
      js: `// Test the decision endpoint (does the request pass?)
const resp = await fetch("{{gatewayProxyUrl}}/decisions/api/users", {
  method: "GET",
  headers: {
    Authorization: "Bearer YOUR_JWT_TOKEN",
  },
})

if (resp.status === 200) {
  // Request would be allowed — check mutated headers
  console.log("X-User-Id:", resp.headers.get("X-User-Id"))
  console.log("Decision: ALLOW")
} else {
  console.log("Decision: DENY", resp.status)
  const body = await resp.json()
  console.log("Reason:", body.error?.message)
}`,
      python: `import requests

# Test the decision endpoint
resp = requests.get(
    "{{gatewayProxyUrl}}/decisions/api/users",
    headers={"Authorization": "Bearer YOUR_JWT_TOKEN"},
)
if resp.status_code == 200:
    print("Decision: ALLOW")
    print("X-User-Id:", resp.headers.get("X-User-Id"))
else:
    print("Decision: DENY", resp.status_code)`,
      go: `req, _ := http.NewRequest("GET",
    "{{gatewayProxyUrl}}/decisions/api/users", nil)
req.Header.Set("Authorization", "Bearer YOUR_JWT_TOKEN")
resp, _ := http.DefaultClient.Do(req)
if resp.StatusCode == 200 {
    fmt.Println("Decision: ALLOW")
    fmt.Println("X-User-Id:", resp.Header.Get("X-User-Id"))
} else {
    fmt.Println("Decision: DENY", resp.StatusCode)
}`,
      curl: `# Test the decision endpoint
curl -sv "{{gatewayProxyUrl}}/decisions/api/users" \\
  -H "Authorization: Bearer YOUR_JWT_TOKEN" 2>&1 | grep -E "< (HTTP|X-User)"`,
    },
  },
};

const GATEWAY_RULE_TEMPLATES = [
  {
    name: "Public API (Anonymous)",
    description: "Allow unauthenticated access to public endpoints",
    rule: { id: "public-api", match: { url: "<https://api.example.com/public/<**>>", methods: ["GET"] }, authenticators: [{ handler: "anonymous" }], authorizer: { handler: "allow" }, mutators: [{ handler: "noop" }] },
  },
  {
    name: "Protected API (Bearer Token)",
    description: "Require a valid OAuth2 bearer token",
    rule: { id: "protected-api", match: { url: "<https://api.example.com/api/<**>>", methods: ["GET", "POST", "PUT", "DELETE"] }, authenticators: [{ handler: "oauth2_introspection", config: { introspection_url: "http://hydra:4445/admin/oauth2/introspect" } }], authorizer: { handler: "allow" }, mutators: [{ handler: "header", config: { headers: { "X-User": "{{ print .Subject }}" } } }] },
  },
  {
    name: "Cookie Session (Kratos)",
    description: "Authenticate via Kratos session cookie",
    rule: { id: "kratos-session", match: { url: "<https://app.example.com/<**>>", methods: ["GET", "POST"] }, authenticators: [{ handler: "cookie_session", config: { check_session_url: "http://kratos:4433/sessions/whoami" } }], authorizer: { handler: "allow" }, mutators: [{ handler: "header", config: { headers: { "X-User-Id": "{{ print .Subject }}" } } }] },
  },
  {
    name: "JWT Validation",
    description: "Validate JWT tokens from Authorization header",
    rule: { id: "jwt-api", match: { url: "<https://api.example.com/v1/<**>>", methods: ["GET", "POST"] }, authenticators: [{ handler: "jwt", config: { jwks_urls: ["http://hydra:4444/.well-known/jwks.json"], required_scope: ["openid"] } }], authorizer: { handler: "allow" }, mutators: [{ handler: "id_token", config: { issuer_url: "https://api.example.com" } }] },
  },
  {
    name: "Keto Authorization",
    description: "Check permissions via Ory Keto before allowing access",
    rule: { id: "keto-authz", match: { url: "<https://api.example.com/resources/<**>>", methods: ["GET", "POST", "DELETE"] }, authenticators: [{ handler: "oauth2_introspection" }], authorizer: { handler: "remote_json", config: { remote: "http://keto:4466/relation-tuples/check", payload: '{"namespace":"resources","object":"{{ printIndex .MatchContext.RegexpCaptureGroups 0 }}","relation":"access","subject_id":"{{ print .Subject }}"}' } }, mutators: [{ handler: "noop" }] },
  },
];

const GATEWAY_HANDLER_SECTIONS = [
  {
    type: "Authenticator",
    tagColor: "bg-accent-500/10 text-accent-300",
    handlers: [
      { name: "noop", description: "Bypasses authentication entirely.", common: true, config: {} },
      { name: "unauthorized", description: "Rejects every request with 401 Unauthorized.", config: {} },
      { name: "anonymous", description: "Allows unauthenticated access by assigning a configurable anonymous subject.", common: true, config: { subject: "anonymous" } },
      { name: "cookie_session", description: "Validates session cookies by calling an external session-check endpoint (e.g. Ory Kratos whoami).", common: true, config: { check_session_url: "http://kratos:4433/sessions/whoami", preserve_path: true, extra_from: "@this", subject_from: "identity.id" } },
      { name: "oauth2_client_credentials", description: "Authenticates using the OAuth2 Client Credentials flow.", config: { token_url: "http://hydra:4444/oauth2/token", required_scope: ["openid"] } },
      { name: "oauth2_introspection", description: "Introspects OAuth2 Bearer tokens via the introspection endpoint (RFC 7662).", common: true, config: { introspection_url: "http://hydra:4445/admin/oauth2/introspect", required_scope: ["openid"], target_audience: [] } },
      { name: "jwt", description: "Validates JWTs from the Authorization header against JWKS URLs.", common: true, config: { jwks_urls: ["http://hydra:4444/.well-known/jwks.json"], required_scope: ["openid"], target_audience: ["https://api.example.com"], trusted_issuers: ["https://auth.example.com"], token_from: { header: "Authorization" } } },
    ],
  },
  {
    type: "Authorizer",
    tagColor: "bg-slate-700/50 text-slate-300",
    handlers: [
      { name: "allow", description: "Permits every authenticated request.", common: true, config: {} },
      { name: "deny", description: "Rejects every request with 403 Forbidden.", config: {} },
      { name: "keto_engine_acp_ory", description: "Checks permissions against Ory Keto (relation-based access control).", common: true, config: { base_url: "http://keto:4466", required_action: "read", required_resource: "resources:{{ .MatchContext.URL.Path }}", subject: "{{ print .Subject }}", flavor: "glob" } },
      { name: "remote", description: "Delegates authorization to an external HTTP service.", config: { remote: "https://authz.internal/check", headers: { "X-Original-URL": "{{ .MatchContext.URL }}" } } },
      { name: "remote_json", description: "Delegates authorization to an external JSON API (e.g. Keto check).", common: true, config: { remote: "http://keto:4466/relation-tuples/check", payload: "{\"namespace\":\"resources\",\"object\":\"{{ printIndex .MatchContext.RegexpCaptureGroups 0 }}\",\"relation\":\"access\",\"subject_id\":\"{{ print .Subject }}\"}" } },
    ],
  },
  {
    type: "Mutator",
    tagColor: "bg-emerald-500/10 text-emerald-300",
    handlers: [
      { name: "noop", description: "Passes the request without modification.", common: true, config: {} },
      { name: "id_token", description: "Generates a signed JWT and injects it into the Authorization header.", common: true, config: { issuer_url: "https://api.example.com", jwks_url: "file:///etc/secrets/jwks.json", claims: "{\"aud\":[\"https://api.example.com\"],\"sub\":\"{{ print .Subject }}\"}" } },
      { name: "header", description: "Injects custom HTTP headers with Go template support.", common: true, config: { headers: { "X-User-Id": "{{ print .Subject }}", "X-User-Email": "{{ print .Extra.identity.traits.email }}" } } },
      { name: "cookie", description: "Sets cookies on the upstream request.", config: { cookies: { "session_user": "{{ print .Subject }}", "session_token": "{{ print .Extra.access_token }}" } } },
      { name: "hydrator", description: "Enriches the session by calling an external API before forwarding.", config: { api: { url: "http://user-service.internal/enrich", auth: { type: "api_key", config: { in: "header", name: "X-API-Key", value: "secret" } } }, cache: { enabled: true, ttl: "60s" } } },
    ],
  },
];

const STORAGE_SNIPPETS = {
  upload: {
    label: "Upload File",
    code: {
      js: `import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"

const s3 = new S3Client({
  endpoint: "{{s3Url}}",
  region: "us-east-1",
  credentials: {
    accessKeyId: "YOUR_ACCESS_KEY",
    secretAccessKey: "YOUR_SECRET_KEY",
  },
  forcePathStyle: true, // Required for MinIO
})

// Upload a file
const file = new File(["Hello, World!"], "hello.txt", { type: "text/plain" })
await s3.send(new PutObjectCommand({
  Bucket: "my-bucket",
  Key: "uploads/hello.txt",
  Body: file,
  ContentType: file.type,
}))
console.log("Uploaded successfully")`,
      python: `import boto3

s3 = boto3.client("s3",
    endpoint_url="{{s3Url}}",
    aws_access_key_id="YOUR_ACCESS_KEY",
    aws_secret_access_key="YOUR_SECRET_KEY",
)

# Upload a file
s3.upload_file(
    "local-file.txt",
    "my-bucket",
    "uploads/hello.txt",
    ExtraArgs={"ContentType": "text/plain"},
)

# Or upload from bytes
s3.put_object(
    Bucket="my-bucket",
    Key="uploads/data.json",
    Body=b'{"hello": "world"}',
    ContentType="application/json",
)`,
      go: `import (
    "github.com/aws/aws-sdk-go-v2/aws"
    "github.com/aws/aws-sdk-go-v2/service/s3"
)

client := s3.New(s3.Options{
    BaseEndpoint: aws.String("{{s3Url}}"),
    Region:       "us-east-1",
    Credentials:  aws.NewCredentialsCache(credentials.NewStaticCredentialsProvider(
        "YOUR_ACCESS_KEY", "YOUR_SECRET_KEY", "",
    )),
    UsePathStyle: true,
})

// Upload a file
file, _ := os.Open("local-file.txt")
defer file.Close()
client.PutObject(ctx, &s3.PutObjectInput{
    Bucket:      aws.String("my-bucket"),
    Key:         aws.String("uploads/hello.txt"),
    Body:        file,
    ContentType: aws.String("text/plain"),
})`,
      curl: `# Upload a file
curl -s -X PUT "{{s3Url}}/my-bucket/uploads/hello.txt" \\
  -H "Content-Type: text/plain" \\
  --data-binary @local-file.txt \\
  --aws-sigv4 "aws:amz:us-east-1:s3" \\
  --user "YOUR_ACCESS_KEY:YOUR_SECRET_KEY"`,
    },
  },
  download: {
    label: "Download File",
    code: {
      js: `import { GetObjectCommand } from "@aws-sdk/client-s3"

const resp = await s3.send(new GetObjectCommand({
  Bucket: "my-bucket",
  Key: "uploads/hello.txt",
}))

// Read the body as text
const body = await resp.Body?.transformToString()
console.log("Content:", body)

// Or save as a file (Node.js)
const fs = await import("fs")
const stream = resp.Body
stream.pipe(fs.createWriteStream("downloaded.txt"))`,
      python: `# Download a file
s3.download_file("my-bucket", "uploads/hello.txt", "downloaded.txt")

# Or read directly into memory
resp = s3.get_object(Bucket="my-bucket", Key="uploads/hello.txt")
content = resp["Body"].read().decode("utf-8")
print("Content:", content)`,
      go: `result, _ := client.GetObject(ctx, &s3.GetObjectInput{
    Bucket: aws.String("my-bucket"),
    Key:    aws.String("uploads/hello.txt"),
})
defer result.Body.Close()

data, _ := io.ReadAll(result.Body)
fmt.Println("Content:", string(data))`,
      curl: `# Download a file
curl -s "{{s3Url}}/my-bucket/uploads/hello.txt" \\
  --aws-sigv4 "aws:amz:us-east-1:s3" \\
  --user "YOUR_ACCESS_KEY:YOUR_SECRET_KEY" -o downloaded.txt`,
    },
  },
  list: {
    label: "List Objects",
    code: {
      js: `import { ListObjectsV2Command } from "@aws-sdk/client-s3"

const resp = await s3.send(new ListObjectsV2Command({
  Bucket: "my-bucket",
  Prefix: "uploads/",
  MaxKeys: 100,
}))

for (const obj of resp.Contents || []) {
  console.log(\`\${obj.Key}  \${obj.Size} bytes  \${obj.LastModified}\`)
}
console.log(\`Total: \${resp.KeyCount} objects\`)`,
      python: `# List objects in a bucket
resp = s3.list_objects_v2(
    Bucket="my-bucket",
    Prefix="uploads/",
    MaxKeys=100,
)
for obj in resp.get("Contents", []):
    print(f"{obj['Key']}  {obj['Size']} bytes  {obj['LastModified']}")`,
      go: `result, _ := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{
    Bucket:  aws.String("my-bucket"),
    Prefix:  aws.String("uploads/"),
    MaxKeys: aws.Int32(100),
})
for _, obj := range result.Contents {
    fmt.Printf("%s  %d bytes\\n", *obj.Key, *obj.Size)
}`,
      curl: `# List objects
curl -s "{{s3Url}}/my-bucket?list-type=2&prefix=uploads/&max-keys=100" \\
  --aws-sigv4 "aws:amz:us-east-1:s3" \\
  --user "YOUR_ACCESS_KEY:YOUR_SECRET_KEY"`,
    },
  },
  presigned: {
    label: "Presigned URL",
    code: {
      js: `import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3"

// Generate a presigned download URL (valid 1 hour)
const downloadUrl = await getSignedUrl(s3, new GetObjectCommand({
  Bucket: "my-bucket",
  Key: "uploads/report.pdf",
}), { expiresIn: 3600 })
console.log("Download URL:", downloadUrl)

// Generate a presigned upload URL
const uploadUrl = await getSignedUrl(s3, new PutObjectCommand({
  Bucket: "my-bucket",
  Key: "uploads/new-file.pdf",
  ContentType: "application/pdf",
}), { expiresIn: 3600 })

// Client can upload directly to this URL
await fetch(uploadUrl, { method: "PUT", body: fileData })`,
      python: `# Generate a presigned download URL (valid 1 hour)
download_url = s3.generate_presigned_url(
    "get_object",
    Params={"Bucket": "my-bucket", "Key": "uploads/report.pdf"},
    ExpiresIn=3600,
)
print("Download URL:", download_url)

# Generate a presigned upload URL
upload_url = s3.generate_presigned_url(
    "put_object",
    Params={"Bucket": "my-bucket", "Key": "uploads/new-file.pdf"},
    ExpiresIn=3600,
)
print("Upload URL:", upload_url)`,
      go: `presigner := s3.NewPresignClient(client)

// Presigned download URL
downloadReq, _ := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
    Bucket: aws.String("my-bucket"),
    Key:    aws.String("uploads/report.pdf"),
}, s3.WithPresignExpires(time.Hour))
fmt.Println("Download URL:", downloadReq.URL)

// Presigned upload URL
uploadReq, _ := presigner.PresignPutObject(ctx, &s3.PutObjectInput{
    Bucket: aws.String("my-bucket"),
    Key:    aws.String("uploads/new-file.pdf"),
}, s3.WithPresignExpires(time.Hour))
fmt.Println("Upload URL:", uploadReq.URL)`,
      curl: `# MinIO client generates presigned URLs
# Install: pip install minio or use mc (MinIO Client)

# Using mc CLI:
mc alias set myminio {{s3Url}} YOUR_ACCESS_KEY YOUR_SECRET_KEY
mc share download myminio/my-bucket/uploads/report.pdf --expire=1h
mc share upload myminio/my-bucket/uploads/ --expire=1h`,
    },
  },
  bucket: {
    label: "Manage Buckets",
    code: {
      js: `import { CreateBucketCommand, ListBucketsCommand, DeleteBucketCommand } from "@aws-sdk/client-s3"

// Create a bucket
await s3.send(new CreateBucketCommand({ Bucket: "my-new-bucket" }))

// List all buckets
const { Buckets } = await s3.send(new ListBucketsCommand({}))
for (const b of Buckets || []) {
  console.log(\`\${b.Name}  created: \${b.CreationDate}\`)
}

// Delete empty bucket
await s3.send(new DeleteBucketCommand({ Bucket: "old-bucket" }))`,
      python: `# Create a bucket
s3.create_bucket(Bucket="my-new-bucket")

# List all buckets
resp = s3.list_buckets()
for bucket in resp["Buckets"]:
    print(f"{bucket['Name']}  created: {bucket['CreationDate']}")

# Delete empty bucket
s3.delete_bucket(Bucket="old-bucket")`,
      go: `// Create a bucket
client.CreateBucket(ctx, &s3.CreateBucketInput{
    Bucket: aws.String("my-new-bucket"),
})

// List all buckets
result, _ := client.ListBuckets(ctx, &s3.ListBucketsInput{})
for _, b := range result.Buckets {
    fmt.Printf("%s  created: %s\\n", *b.Name, b.CreationDate)
}`,
      curl: `# Create a bucket
curl -s -X PUT "{{s3Url}}/my-new-bucket" \\
  --aws-sigv4 "aws:amz:us-east-1:s3" \\
  --user "YOUR_ACCESS_KEY:YOUR_SECRET_KEY"

# List all buckets
curl -s "{{s3Url}}/" \\
  --aws-sigv4 "aws:amz:us-east-1:s3" \\
  --user "YOUR_ACCESS_KEY:YOUR_SECRET_KEY"`,
    },
  },
};

const SEARCH_SNIPPETS = {
  fts: {
    label: "Full-Text Search",
    code: {
      js: `// Full-text search using PostgreSQL tsvector
const query = "authentication login"

const { rows } = await pool.query(\`
  SELECT id, title, ts_rank(search_vector, query) AS rank
  FROM documents,
       plainto_tsquery('english', $1) query
  WHERE search_vector @@ query
  ORDER BY rank DESC
  LIMIT 20
\`, [query])

console.log(\`Found \${rows.length} results\`)
rows.forEach(r => console.log(\`  [\${r.rank.toFixed(3)}] \${r.title}\`))`,
      python: `import psycopg2

conn = psycopg2.connect("postgresql://user:pass@host/db")
cur = conn.cursor()

query = "authentication login"
cur.execute("""
    SELECT id, title, ts_rank(search_vector, query) AS rank
    FROM documents,
         plainto_tsquery('english', %s) query
    WHERE search_vector @@ query
    ORDER BY rank DESC
    LIMIT 20
""", (query,))

for row in cur.fetchall():
    print(f"  [{row[2]:.3f}] {row[1]}")`,
      go: `rows, _ := db.Query(\`
    SELECT id, title, ts_rank(search_vector, query) AS rank
    FROM documents,
         plainto_tsquery('english', $1) query
    WHERE search_vector @@ query
    ORDER BY rank DESC
    LIMIT 20\`, query)
defer rows.Close()
for rows.Next() {
    var id int; var title string; var rank float64
    rows.Scan(&id, &title, &rank)
    fmt.Printf("  [%.3f] %s\\n", rank, title)
}`,
      curl: `# Full-text search via Truss SQL API
curl -s "{{baseUrl}}/api/sql" \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer API_KEY" \\
  -d '{
    "query": "SELECT id, title, ts_rank(search_vector, plainto_tsquery($1)) AS rank FROM documents WHERE search_vector @@ plainto_tsquery($1) ORDER BY rank DESC LIMIT 20",
    "params": ["authentication login"]
  }'`,
    },
  },
  index: {
    label: "Create Index",
    code: {
      js: `// Create a GIN index for full-text search
await pool.query(\`
  -- Add a tsvector column
  ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS search_vector tsvector;

  -- Populate from existing text columns
  UPDATE documents SET search_vector =
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B');

  -- Create GIN index for fast searches
  CREATE INDEX IF NOT EXISTS idx_documents_search
    ON documents USING GIN (search_vector);

  -- Auto-update on INSERT/UPDATE
  CREATE OR REPLACE FUNCTION documents_search_trigger()
  RETURNS trigger AS $$
  BEGIN
    NEW.search_vector :=
      setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(NEW.body, '')), 'B');
    RETURN NEW;
  END $$ LANGUAGE plpgsql;

  DROP TRIGGER IF EXISTS trg_documents_search ON documents;
  CREATE TRIGGER trg_documents_search
    BEFORE INSERT OR UPDATE ON documents
    FOR EACH ROW EXECUTE FUNCTION documents_search_trigger();
\`)`,
      python: `# Create full-text search index
cur.execute("""
    ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS search_vector tsvector;

    UPDATE documents SET search_vector =
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(body, '')), 'B');

    CREATE INDEX IF NOT EXISTS idx_documents_search
      ON documents USING GIN (search_vector);
""")
conn.commit()
print("Search index created")`,
      go: `_, _ = db.Exec(\`
    ALTER TABLE documents
      ADD COLUMN IF NOT EXISTS search_vector tsvector;
    UPDATE documents SET search_vector =
      setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(body, '')), 'B');
    CREATE INDEX IF NOT EXISTS idx_documents_search
      ON documents USING GIN (search_vector);
\`)`,
      curl: `# Create search index via SQL API
curl -s -X POST "{{baseUrl}}/api/sql" \\
  -H "Authorization: Bearer SERVICE_ROLE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"query": "CREATE INDEX IF NOT EXISTS idx_documents_search ON documents USING GIN (to_tsvector('\\''english'\\'', title || '\\'' '\\'' || body))"}'`,
    },
  },
  vector: {
    label: "Vector Search",
    code: {
      js: `// Vector similarity search using pgvector
// Requires: CREATE EXTENSION IF NOT EXISTS vector;

// Store embeddings
await pool.query(\`
  CREATE TABLE IF NOT EXISTS embeddings (
    id serial PRIMARY KEY,
    content text,
    embedding vector(1536)  -- OpenAI ada-002 dimension
  )
\`)

// Insert an embedding
const embedding = await getEmbedding("How to reset password")  // from OpenAI
await pool.query(
  "INSERT INTO embeddings (content, embedding) VALUES ($1, $2)",
  ["How to reset password", JSON.stringify(embedding)]
)

// Search by similarity (cosine distance)
const queryEmb = await getEmbedding("forgot my password")
const { rows } = await pool.query(\`
  SELECT content, 1 - (embedding <=> $1::vector) AS similarity
  FROM embeddings
  ORDER BY embedding <=> $1::vector
  LIMIT 5
\`, [JSON.stringify(queryEmb)])`,
      python: `# Vector similarity search using pgvector
import numpy as np

# Create table with vector column
cur.execute("""
    CREATE EXTENSION IF NOT EXISTS vector;
    CREATE TABLE IF NOT EXISTS embeddings (
        id serial PRIMARY KEY,
        content text,
        embedding vector(1536)
    );
""")

# Insert embedding
embedding = get_embedding("How to reset password")  # from OpenAI
cur.execute(
    "INSERT INTO embeddings (content, embedding) VALUES (%s, %s)",
    ("How to reset password", str(embedding.tolist()))
)

# Search by cosine similarity
query_emb = get_embedding("forgot my password")
cur.execute("""
    SELECT content, 1 - (embedding <=> %s::vector) AS similarity
    FROM embeddings
    ORDER BY embedding <=> %s::vector
    LIMIT 5
""", (str(query_emb.tolist()), str(query_emb.tolist())))`,
      go: `// Vector search with pgvector
_, _ = db.Exec(\`CREATE EXTENSION IF NOT EXISTS vector\`)

// Insert embedding
embedding := getEmbedding("How to reset password") // [1536]float64
db.Exec("INSERT INTO embeddings (content, embedding) VALUES ($1, $2)",
    "How to reset password", pgvector.NewVector(embedding))

// Cosine similarity search
rows, _ := db.Query(\`
    SELECT content, 1 - (embedding <=> $1::vector) AS similarity
    FROM embeddings ORDER BY embedding <=> $1::vector LIMIT 5\`,
    pgvector.NewVector(queryEmbedding))`,
      curl: `# Vector search via SQL API
curl -s "{{baseUrl}}/api/sql" \\
  -H "Authorization: Bearer API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "SELECT content, 1 - (embedding <=> $1::vector) AS similarity FROM embeddings ORDER BY embedding <=> $1::vector LIMIT 5",
    "params": ["[0.1, 0.2, ...]"]
  }'`,
    },
  },
  hybrid: {
    label: "Hybrid Search",
    code: {
      js: `// Hybrid search: combine full-text + vector similarity
const query = "password reset guide"
const queryEmb = await getEmbedding(query)

const { rows } = await pool.query(\`
  WITH fts AS (
    SELECT id, ts_rank(search_vector, plainto_tsquery('english', $1)) AS fts_score
    FROM documents
    WHERE search_vector @@ plainto_tsquery('english', $1)
  ),
  vec AS (
    SELECT id, 1 - (embedding <=> $2::vector) AS vec_score
    FROM documents
    ORDER BY embedding <=> $2::vector
    LIMIT 50
  )
  SELECT d.id, d.title,
    COALESCE(f.fts_score, 0) * 0.4 + COALESCE(v.vec_score, 0) * 0.6 AS combined_score
  FROM documents d
  LEFT JOIN fts f ON d.id = f.id
  LEFT JOIN vec v ON d.id = v.id
  WHERE f.id IS NOT NULL OR v.id IS NOT NULL
  ORDER BY combined_score DESC
  LIMIT 10
\`, [query, JSON.stringify(queryEmb)])`,
      python: `# Hybrid search: FTS + vector with weighted scoring
query = "password reset guide"
query_emb = get_embedding(query)

cur.execute("""
    WITH fts AS (
        SELECT id, ts_rank(search_vector, plainto_tsquery('english', %s)) AS fts_score
        FROM documents WHERE search_vector @@ plainto_tsquery('english', %s)
    ),
    vec AS (
        SELECT id, 1 - (embedding <=> %s::vector) AS vec_score
        FROM documents ORDER BY embedding <=> %s::vector LIMIT 50
    )
    SELECT d.id, d.title,
        COALESCE(f.fts_score, 0) * 0.4 + COALESCE(v.vec_score, 0) * 0.6 AS score
    FROM documents d
    LEFT JOIN fts f ON d.id = f.id
    LEFT JOIN vec v ON d.id = v.id
    WHERE f.id IS NOT NULL OR v.id IS NOT NULL
    ORDER BY score DESC LIMIT 10
""", (query, query, str(query_emb.tolist()), str(query_emb.tolist())))`,
      go: `// Hybrid search combining FTS and vector similarity
rows, _ := db.Query(\`
    WITH fts AS (
        SELECT id, ts_rank(search_vector, plainto_tsquery('english', $1)) AS fts_score
        FROM documents WHERE search_vector @@ plainto_tsquery('english', $1)
    ),
    vec AS (
        SELECT id, 1 - (embedding <=> $2::vector) AS vec_score
        FROM documents ORDER BY embedding <=> $2::vector LIMIT 50
    )
    SELECT d.id, d.title,
        COALESCE(f.fts_score, 0) * 0.4 + COALESCE(v.vec_score, 0) * 0.6 AS score
    FROM documents d
    LEFT JOIN fts f ON d.id = f.id LEFT JOIN vec v ON d.id = v.id
    WHERE f.id IS NOT NULL OR v.id IS NOT NULL
    ORDER BY score DESC LIMIT 10\`, query, pgvector.NewVector(queryEmb))`,
      curl: `# Hybrid search via SQL API (combine FTS + vector in one query)
curl -s "{{baseUrl}}/api/sql" \\
  -H "Authorization: Bearer API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "query": "WITH fts AS (SELECT id, ts_rank(sv, plainto_tsquery($1)) AS s FROM docs WHERE sv @@ plainto_tsquery($1)), vec AS (SELECT id, 1-(embedding <=> $2::vector) AS s FROM docs ORDER BY embedding <=> $2::vector LIMIT 50) SELECT * FROM fts NATURAL FULL JOIN vec ORDER BY coalesce(fts.s,0)*0.4+coalesce(vec.s,0)*0.6 DESC LIMIT 10",
    "params": ["password reset", "[0.1, 0.2, ...]"]
  }'`,
    },
  },
};

const WEBHOOKS_SNIPPETS = {
  create: {
    label: "Create Webhook",
    code: {
      js: `// Create a webhook subscription
const resp = await fetch("{{baseUrl}}/api/webhooks", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer API_KEY",
  },
  body: JSON.stringify({
    url: "https://myapp.com/hooks/truss",
    events: ["INSERT", "UPDATE", "DELETE"],
    table: "users",
    secret: "whsec_my_signing_secret",
    enabled: true,
  }),
})
const webhook = await resp.json()
console.log("Webhook ID:", webhook.id)`,
      python: `import requests

# Create a webhook subscription
resp = requests.post("{{baseUrl}}/api/webhooks",
    headers={"Authorization": "Bearer API_KEY"},
    json={
        "url": "https://myapp.com/hooks/truss",
        "events": ["INSERT", "UPDATE", "DELETE"],
        "table": "users",
        "secret": "whsec_my_signing_secret",
        "enabled": True,
    },
)
webhook = resp.json()
print("Webhook ID:", webhook["id"])`,
      go: `body, _ := json.Marshal(map[string]interface{}{
    "url":     "https://myapp.com/hooks/truss",
    "events":  []string{"INSERT", "UPDATE", "DELETE"},
    "table":   "users",
    "secret":  "whsec_my_signing_secret",
    "enabled": true,
})
req, _ := http.NewRequest("POST", "{{baseUrl}}/api/webhooks",
    bytes.NewReader(body))
req.Header.Set("Authorization", "Bearer API_KEY")
req.Header.Set("Content-Type", "application/json")
resp, _ := http.DefaultClient.Do(req)`,
      curl: `# Create a webhook
curl -s -X POST "{{baseUrl}}/api/webhooks" \\
  -H "Authorization: Bearer API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "url": "https://myapp.com/hooks/truss",
    "events": ["INSERT", "UPDATE", "DELETE"],
    "table": "users",
    "secret": "whsec_my_signing_secret",
    "enabled": true
  }'`,
    },
  },
  handler: {
    label: "Handle Payload",
    code: {
      js: `// Express webhook handler
import express from "express"
import crypto from "crypto"

const app = express()
app.use(express.json())

app.post("/hooks/truss", (req, res) => {
  const { event, table, record, old_record, timestamp } = req.body

  switch (event) {
    case "INSERT":
      console.log(\`New \${table} record:\`, record)
      // e.g., Send welcome email for new user
      break
    case "UPDATE":
      console.log(\`Updated \${table}:\`, { old: old_record, new: record })
      // e.g., Sync changes to external system
      break
    case "DELETE":
      console.log(\`Deleted from \${table}:\`, old_record)
      // e.g., Clean up related resources
      break
  }

  res.json({ received: true })
})`,
      python: `from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/hooks/truss", methods=["POST"])
def handle_webhook():
    payload = request.json
    event = payload["event"]
    table = payload["table"]
    record = payload.get("record")
    old_record = payload.get("old_record")

    if event == "INSERT":
        print(f"New {table} record:", record)
    elif event == "UPDATE":
        print(f"Updated {table}:", record)
    elif event == "DELETE":
        print(f"Deleted from {table}:", old_record)

    return jsonify({"received": True})`,
      go: `type WebhookPayload struct {
    Event     string                 \`json:"event"\`
    Table     string                 \`json:"table"\`
    Record    map[string]interface{} \`json:"record"\`
    OldRecord map[string]interface{} \`json:"old_record"\`
    Timestamp string                 \`json:"timestamp"\`
}

func webhookHandler(w http.ResponseWriter, r *http.Request) {
    var payload WebhookPayload
    json.NewDecoder(r.Body).Decode(&payload)

    switch payload.Event {
    case "INSERT":
        log.Printf("New %s record: %v", payload.Table, payload.Record)
    case "UPDATE":
        log.Printf("Updated %s: %v", payload.Table, payload.Record)
    case "DELETE":
        log.Printf("Deleted from %s: %v", payload.Table, payload.OldRecord)
    }
    json.NewEncoder(w).Encode(map[string]bool{"received": true})
}`,
      curl: `# Webhook payload example (what your endpoint receives):
# POST /hooks/truss
# Content-Type: application/json
# X-Webhook-Signature: sha256=abc123...
#
# {
#   "event": "INSERT",
#   "table": "users",
#   "schema": "public",
#   "record": {
#     "id": 42,
#     "email": "new@example.com",
#     "created_at": "2024-01-15T10:30:00Z"
#   },
#   "old_record": null,
#   "timestamp": "2024-01-15T10:30:00.123Z"
# }

# Test your webhook endpoint
curl -s -X POST "https://myapp.com/hooks/truss" \\
  -H "Content-Type: application/json" \\
  -d '{"event":"INSERT","table":"users","record":{"id":1,"email":"test@example.com"}}'`,
    },
  },
  verify: {
    label: "Verify Signature",
    code: {
      js: `import crypto from "crypto"

function verifyWebhookSignature(payload, signature, secret) {
  const expected = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex")

  const sig = signature.replace("sha256=", "")
  return crypto.timingSafeEqual(
    Buffer.from(sig, "hex"),
    Buffer.from(expected, "hex"),
  )
}

// In your webhook handler:
app.post("/hooks/truss", (req, res) => {
  const signature = req.headers["x-webhook-signature"]
  if (!verifyWebhookSignature(req.body, signature, "whsec_my_secret")) {
    return res.status(401).json({ error: "Invalid signature" })
  }
  // Process the verified webhook...
})`,
      python: `import hmac, hashlib

def verify_signature(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(
        secret.encode(), payload, hashlib.sha256
    ).hexdigest()
    sig = signature.replace("sha256=", "")
    return hmac.compare_digest(sig, expected)

# In your webhook handler:
@app.route("/hooks/truss", methods=["POST"])
def webhook():
    sig = request.headers.get("X-Webhook-Signature", "")
    if not verify_signature(request.data, sig, "whsec_my_secret"):
        return jsonify({"error": "Invalid signature"}), 401
    # Process verified webhook...`,
      go: `func verifySignature(payload []byte, signature, secret string) bool {
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write(payload)
    expected := hex.EncodeToString(mac.Sum(nil))
    sig := strings.TrimPrefix(signature, "sha256=")
    return hmac.Equal([]byte(sig), []byte(expected))
}

func webhookHandler(w http.ResponseWriter, r *http.Request) {
    body, _ := io.ReadAll(r.Body)
    sig := r.Header.Get("X-Webhook-Signature")
    if !verifySignature(body, sig, "whsec_my_secret") {
        http.Error(w, "Invalid signature", 401)
        return
    }
    // Process verified webhook...
}`,
      curl: `# Compute expected signature for verification
echo -n '{"event":"INSERT","table":"users","record":{"id":1}}' | \\
  openssl dgst -sha256 -hmac "whsec_my_secret"

# Compare with the X-Webhook-Signature header value
# The header format is: sha256=<hex_digest>`,
    },
  },
  list: {
    label: "List Webhooks",
    code: {
      js: `// List all webhook subscriptions
const resp = await fetch("{{baseUrl}}/api/webhooks", {
  headers: { Authorization: "Bearer API_KEY" },
})
const webhooks = await resp.json()
for (const wh of webhooks) {
  console.log(\`[\${wh.enabled ? "ON" : "OFF"}] \${wh.table} → \${wh.url}\`)
  console.log(\`  Events: \${wh.events.join(", ")}\`)
}

// Delete a webhook
await fetch(\`{{baseUrl}}/api/webhooks/\${webhookId}\`, {
  method: "DELETE",
  headers: { Authorization: "Bearer API_KEY" },
})`,
      python: `# List all webhooks
resp = requests.get("{{baseUrl}}/api/webhooks",
    headers={"Authorization": "Bearer API_KEY"})
for wh in resp.json():
    status = "ON" if wh["enabled"] else "OFF"
    print(f"[{status}] {wh['table']} → {wh['url']}")

# Delete a webhook
requests.delete(f"{{baseUrl}}/api/webhooks/{webhook_id}",
    headers={"Authorization": "Bearer API_KEY"})`,
      go: `req, _ := http.NewRequest("GET", "{{baseUrl}}/api/webhooks", nil)
req.Header.Set("Authorization", "Bearer API_KEY")
resp, _ := http.DefaultClient.Do(req)
var webhooks []map[string]interface{}
json.NewDecoder(resp.Body).Decode(&webhooks)`,
      curl: `# List all webhooks
curl -s "{{baseUrl}}/api/webhooks" \\
  -H "Authorization: Bearer API_KEY" | jq '.[] | {id, table, url, enabled}'

# Delete a webhook
curl -s -X DELETE "{{baseUrl}}/api/webhooks/WEBHOOK_ID" \\
  -H "Authorization: Bearer API_KEY"`,
    },
  },
};

const REALTIME_SNIPPETS = {
  subscribe: {
    label: "Subscribe",
    code: {
      js: `// Connect to Truss Realtime via WebSocket
const ws = new WebSocket("{{wsUrl}}")

ws.onopen = () => {
  console.log("Connected to Realtime")

  // Subscribe to changes on the "messages" table
  ws.send(JSON.stringify({
    type: "subscribe",
    table: "messages",
    schema: "public",
    events: ["INSERT", "UPDATE", "DELETE"],
  }))
}

ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  switch (data.type) {
    case "INSERT":
      console.log("New message:", data.record)
      break
    case "UPDATE":
      console.log("Updated:", data.record)
      break
    case "DELETE":
      console.log("Deleted:", data.old_record)
      break
  }
}`,
      python: `import websocket
import json

def on_message(ws, message):
    data = json.loads(message)
    if data["type"] == "INSERT":
        print("New record:", data["record"])
    elif data["type"] == "UPDATE":
        print("Updated:", data["record"])
    elif data["type"] == "DELETE":
        print("Deleted:", data["old_record"])

def on_open(ws):
    # Subscribe to changes on "messages" table
    ws.send(json.dumps({
        "type": "subscribe",
        "table": "messages",
        "schema": "public",
        "events": ["INSERT", "UPDATE", "DELETE"],
    }))

ws = websocket.WebSocketApp(
    "{{wsUrl}}",
    on_open=on_open,
    on_message=on_message,
)
ws.run_forever()`,
      go: `import "github.com/gorilla/websocket"

conn, _, _ := websocket.DefaultDialer.Dial(
    "{{wsUrl}}", nil)
defer conn.Close()

// Subscribe to changes
conn.WriteJSON(map[string]interface{}{
    "type":   "subscribe",
    "table":  "messages",
    "schema": "public",
    "events": []string{"INSERT", "UPDATE", "DELETE"},
})

// Listen for changes
for {
    var msg map[string]interface{}
    conn.ReadJSON(&msg)
    fmt.Printf("[%s] %v\\n", msg["type"], msg["record"])
}`,
      curl: `# Connect via websocat (WebSocket CLI tool)
# Install: cargo install websocat
websocat "{{wsUrl}}"

# Then send subscription message:
# {"type":"subscribe","table":"messages","events":["INSERT","UPDATE","DELETE"]}

# Or use wscat (Node.js):
# npx wscat -c "{{wsUrl}}"`,
    },
  },
  filter: {
    label: "Filtered Subscribe",
    code: {
      js: `// Subscribe with filters — only specific events/tables
ws.send(JSON.stringify({
  type: "subscribe",
  table: "orders",
  schema: "public",
  events: ["INSERT"],  // Only new orders
  filter: "status=eq.pending",  // Only pending orders
}))

// Subscribe to multiple tables
for (const table of ["users", "orders", "payments"]) {
  ws.send(JSON.stringify({
    type: "subscribe",
    table,
    events: ["INSERT", "UPDATE"],
  }))
}`,
      python: `# Subscribe with filters
ws.send(json.dumps({
    "type": "subscribe",
    "table": "orders",
    "schema": "public",
    "events": ["INSERT"],
    "filter": "status=eq.pending",
}))

# Subscribe to multiple tables
for table in ["users", "orders", "payments"]:
    ws.send(json.dumps({
        "type": "subscribe",
        "table": table,
        "events": ["INSERT", "UPDATE"],
    }))`,
      go: `// Subscribe with filter
conn.WriteJSON(map[string]interface{}{
    "type":   "subscribe",
    "table":  "orders",
    "events": []string{"INSERT"},
    "filter": "status=eq.pending",
})

// Multiple subscriptions
for _, table := range []string{"users", "orders", "payments"} {
    conn.WriteJSON(map[string]interface{}{
        "type":   "subscribe",
        "table":  table,
        "events": []string{"INSERT", "UPDATE"},
    })
}`,
      curl: `# Subscribe with filter (via websocat)
echo '{"type":"subscribe","table":"orders","events":["INSERT"],"filter":"status=eq.pending"}' | \\
  websocat "{{wsUrl}}"`,
    },
  },
  react: {
    label: "React Hook",
    code: {
      js: `// Custom React hook for Truss Realtime
import { useEffect, useRef, useState, useCallback } from "react"

function useTrussRealtime(table, events = ["INSERT", "UPDATE", "DELETE"]) {
  const ws = useRef(null)
  const [records, setRecords] = useState([])
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    ws.current = new WebSocket("{{wsUrl}}")

    ws.current.onopen = () => {
      setConnected(true)
      ws.current.send(JSON.stringify({ type: "subscribe", table, events }))
    }

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data)
      setRecords(prev => {
        if (data.type === "INSERT") return [...prev, data.record]
        if (data.type === "UPDATE") return prev.map(r => r.id === data.record.id ? data.record : r)
        if (data.type === "DELETE") return prev.filter(r => r.id !== data.old_record.id)
        return prev
      })
    }

    ws.current.onclose = () => setConnected(false)
    return () => ws.current?.close()
  }, [table])

  return { records, connected }
}

// Usage in a component:
function ChatMessages() {
  const { records: messages, connected } = useTrussRealtime("messages")
  return (
    <div>
      <span>{connected ? "Live" : "Reconnecting..."}</span>
      {messages.map(msg => <p key={msg.id}>{msg.text}</p>)}
    </div>
  )
}`,
      python: `# Python: async realtime client with reconnection
import asyncio
import websockets
import json

class TrussRealtime:
    def __init__(self, url):
        self.url = url
        self.subscriptions = []
        self.handlers = {}

    def on(self, table, callback):
        self.subscriptions.append(table)
        self.handlers[table] = callback

    async def connect(self):
        async with websockets.connect(self.url) as ws:
            for table in self.subscriptions:
                await ws.send(json.dumps({
                    "type": "subscribe", "table": table,
                    "events": ["INSERT", "UPDATE", "DELETE"],
                }))
            async for message in ws:
                data = json.loads(message)
                handler = self.handlers.get(data.get("table"))
                if handler:
                    await handler(data)

# Usage:
rt = TrussRealtime("{{wsUrl}}")
rt.on("messages", lambda d: print(f"[{d['type']}] {d['record']}"))
asyncio.run(rt.connect())`,
      go: `// Go: Realtime client with reconnection
type RealtimeClient struct {
    url  string
    conn *websocket.Conn
}

func (c *RealtimeClient) Subscribe(table string, handler func(map[string]interface{})) {
    c.conn.WriteJSON(map[string]interface{}{
        "type": "subscribe", "table": table,
        "events": []string{"INSERT", "UPDATE", "DELETE"},
    })
    go func() {
        for {
            var msg map[string]interface{}
            if err := c.conn.ReadJSON(&msg); err != nil {
                return
            }
            if msg["table"] == table {
                handler(msg)
            }
        }
    }()
}`,
      curl: `# Monitor realtime events from CLI
# Using websocat with auto-reconnect:
while true; do
  echo '{"type":"subscribe","table":"messages","events":["INSERT"]}' | \\
    websocat "{{wsUrl}}" || sleep 2
done`,
    },
  },
  unsubscribe: {
    label: "Unsubscribe",
    code: {
      js: `// Unsubscribe from a table
ws.send(JSON.stringify({
  type: "unsubscribe",
  table: "messages",
}))

// Unsubscribe from all and close
ws.send(JSON.stringify({ type: "unsubscribe_all" }))
ws.close()

// Reconnection pattern
function createRealtimeConnection(table, onEvent) {
  let ws
  let reconnectTimer

  function connect() {
    ws = new WebSocket("{{wsUrl}}")
    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "subscribe", table, events: ["*"] }))
    }
    ws.onmessage = (e) => onEvent(JSON.parse(e.data))
    ws.onclose = () => {
      reconnectTimer = setTimeout(connect, 3000) // Auto-reconnect
    }
  }

  connect()
  return () => {
    clearTimeout(reconnectTimer)
    ws?.close()
  }
}

// Usage:
const disconnect = createRealtimeConnection("orders", (event) => {
  console.log("Order event:", event)
})
// Later: disconnect()`,
      python: `# Unsubscribe from a table
ws.send(json.dumps({"type": "unsubscribe", "table": "messages"}))

# Unsubscribe from all
ws.send(json.dumps({"type": "unsubscribe_all"}))
ws.close()`,
      go: `// Unsubscribe
conn.WriteJSON(map[string]interface{}{
    "type":  "unsubscribe",
    "table": "messages",
})

// Unsubscribe all and close
conn.WriteJSON(map[string]interface{}{"type": "unsubscribe_all"})
conn.Close()`,
      curl: `# Unsubscribe (send via websocat)
echo '{"type":"unsubscribe","table":"messages"}' | \\
  websocat "{{wsUrl}}"`,
    },
  },
};

const EDGE_SNIPPETS = {
  sql: {
    label: "SQL Query",
    code: {
      js: `// Execute SQL over HTTP
const resp = await fetch("{{baseUrl}}/v1/sql", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: "truss_sk_YOUR_SERVICE_KEY",
  },
  body: JSON.stringify({ sql: "SELECT * FROM users LIMIT 10" }),
})
const { rows, rowCount, columns } = await resp.json()
console.log(\`Got \${rowCount} rows\`)
rows.forEach(row => console.log(row))`,
      python: `import requests

resp = requests.post("{{baseUrl}}/v1/sql",
    headers={"apikey": "truss_sk_YOUR_SERVICE_KEY"},
    json={"sql": "SELECT * FROM users LIMIT 10"},
)
data = resp.json()
print(f"Got {data['rowCount']} rows")
for row in data["rows"]:
    print(row)`,
      go: `body, _ := json.Marshal(map[string]string{"sql": "SELECT * FROM users LIMIT 10"})
req, _ := http.NewRequest("POST", "{{baseUrl}}/v1/sql", bytes.NewReader(body))
req.Header.Set("Content-Type", "application/json")
req.Header.Set("apikey", "truss_sk_YOUR_SERVICE_KEY")
resp, _ := http.DefaultClient.Do(req)
var result struct {
    Rows     []map[string]interface{} \`json:"rows"\`
    RowCount int                      \`json:"rowCount"\`
}
json.NewDecoder(resp.Body).Decode(&result)
fmt.Printf("Got %d rows\\n", result.RowCount)`,
      curl: `curl -X POST "{{baseUrl}}/v1/sql" \\
  -H "apikey: truss_sk_YOUR_SERVICE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"sql": "SELECT * FROM users LIMIT 10"}'

# Response:
# {
#   "rows": [{"id": 1, "email": "user@example.com"}],
#   "rowCount": 1,
#   "columns": [{"name": "id", "typeName": "int4"}, ...],
#   "command": "SELECT"
# }`,
    },
  },
  transaction: {
    label: "Transaction",
    code: {
      js: `// Execute multiple statements in one transaction
const resp = await fetch("{{baseUrl}}/v1/sql/transaction", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: "truss_sk_YOUR_SERVICE_KEY",
  },
  body: JSON.stringify({
    statements: [
      { sql: "INSERT INTO orders (user_id, total) VALUES ($1, $2)", params: [1, 99.99] },
      { sql: "UPDATE users SET order_count = order_count + 1 WHERE id = $1", params: [1] },
    ],
  }),
})
const results = await resp.json()
// Auto-rolls back on any error — all-or-nothing`,
      python: `import requests

resp = requests.post("{{baseUrl}}/v1/sql/transaction",
    headers={"apikey": "truss_sk_YOUR_SERVICE_KEY"},
    json={
        "statements": [
            {"sql": "INSERT INTO orders (user_id, total) VALUES ($1, $2)", "params": [1, 99.99]},
            {"sql": "UPDATE users SET order_count = order_count + 1 WHERE id = $1", "params": [1]},
        ]
    },
)
# Auto-rolls back on any error
print(resp.json())`,
      go: `type Statement struct {
    SQL    string        \`json:"sql"\`
    Params []interface{} \`json:"params"\`
}
payload := map[string][]Statement{
    "statements": {
        {SQL: "INSERT INTO orders (user_id, total) VALUES ($1, $2)", Params: []interface{}{1, 99.99}},
        {SQL: "UPDATE users SET order_count = order_count + 1 WHERE id = $1", Params: []interface{}{1}},
    },
}
body, _ := json.Marshal(payload)
req, _ := http.NewRequest("POST", "{{baseUrl}}/v1/sql/transaction", bytes.NewReader(body))
req.Header.Set("Content-Type", "application/json")
req.Header.Set("apikey", "truss_sk_YOUR_SERVICE_KEY")
resp, _ := http.DefaultClient.Do(req)`,
      curl: `curl -X POST "{{baseUrl}}/v1/sql/transaction" \\
  -H "apikey: truss_sk_YOUR_SERVICE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "statements": [
      {"sql": "INSERT INTO orders (user_id, total) VALUES ($1, $2)", "params": [1, 99.99]},
      {"sql": "UPDATE users SET order_count = order_count + 1 WHERE id = $1", "params": [1]}
    ]
  }'
# Max 20 statements per transaction | 10s query timeout | 10,000 row limit`,
    },
  },
  select: {
    label: "Select Rows",
    code: {
      js: `// Auto-REST: Select with filters, ordering, pagination
const params = new URLSearchParams({
  select: "id,email,name",
  status: "eq.active",
  order: "created_at.desc",
  limit: "25",
})
const resp = await fetch(\`{{baseUrl}}/v1/db/users?\${params}\`, {
  headers: { apikey: "truss_pk_YOUR_ANON_KEY" },
})
const users = await resp.json()
// With anon key: RLS policies are enforced
// With service_role key: RLS is bypassed`,
      python: `import requests

# Auto-REST: Select with filters
resp = requests.get("{{baseUrl}}/v1/db/users",
    headers={"apikey": "truss_pk_YOUR_ANON_KEY"},
    params={
        "select": "id,email,name",
        "status": "eq.active",
        "order": "created_at.desc",
        "limit": "25",
    },
)
users = resp.json()
# anon key → RLS enforced | service_role key → RLS bypassed`,
      go: `req, _ := http.NewRequest("GET",
    "{{baseUrl}}/v1/db/users?select=id,email,name&status=eq.active&order=created_at.desc&limit=25", nil)
req.Header.Set("apikey", "truss_pk_YOUR_ANON_KEY")
resp, _ := http.DefaultClient.Do(req)
var users []map[string]interface{}
json.NewDecoder(resp.Body).Decode(&users)`,
      curl: `# Select rows with filters, ordering, pagination
curl "{{baseUrl}}/v1/db/users?select=id,email,name&status=eq.active&order=created_at.desc&limit=25" \\
  -H "apikey: truss_pk_YOUR_ANON_KEY"

# Filter operators: eq, neq, gt, gte, lt, lte, like, ilike, is, in
# Example: ?age=gte.18&role=in.(admin,editor)&name=ilike.*john*`,
    },
  },
  mutate: {
    label: "Insert / Update / Delete",
    code: {
      js: `// INSERT
await fetch("{{baseUrl}}/v1/db/users", {
  method: "POST",
  headers: { "Content-Type": "application/json", apikey: "truss_sk_YOUR_SERVICE_KEY" },
  body: JSON.stringify({ email: "new@user.com", name: "Jane" }),
})

// UPDATE (with filter)
await fetch("{{baseUrl}}/v1/db/users?id=eq.42", {
  method: "PATCH",
  headers: { "Content-Type": "application/json", apikey: "truss_sk_YOUR_SERVICE_KEY" },
  body: JSON.stringify({ name: "Updated Name" }),
})

// DELETE (with filter)
await fetch("{{baseUrl}}/v1/db/users?id=eq.42", {
  method: "DELETE",
  headers: { apikey: "truss_sk_YOUR_SERVICE_KEY" },
})`,
      python: `import requests

headers = {"apikey": "truss_sk_YOUR_SERVICE_KEY"}

# INSERT
requests.post("{{baseUrl}}/v1/db/users",
    headers=headers, json={"email": "new@user.com", "name": "Jane"})

# UPDATE
requests.patch("{{baseUrl}}/v1/db/users?id=eq.42",
    headers=headers, json={"name": "Updated Name"})

# DELETE
requests.delete("{{baseUrl}}/v1/db/users?id=eq.42", headers=headers)`,
      go: `// INSERT
body, _ := json.Marshal(map[string]string{"email": "new@user.com", "name": "Jane"})
req, _ := http.NewRequest("POST", "{{baseUrl}}/v1/db/users", bytes.NewReader(body))
req.Header.Set("apikey", "truss_sk_YOUR_SERVICE_KEY")
req.Header.Set("Content-Type", "application/json")
http.DefaultClient.Do(req)

// UPDATE
body, _ = json.Marshal(map[string]string{"name": "Updated Name"})
req, _ = http.NewRequest("PATCH", "{{baseUrl}}/v1/db/users?id=eq.42", bytes.NewReader(body))
req.Header.Set("apikey", "truss_sk_YOUR_SERVICE_KEY")
req.Header.Set("Content-Type", "application/json")
http.DefaultClient.Do(req)`,
      curl: `# INSERT
curl -X POST "{{baseUrl}}/v1/db/users" \\
  -H "apikey: truss_sk_YOUR_SERVICE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"email": "new@user.com", "name": "Jane"}'

# UPDATE
curl -X PATCH "{{baseUrl}}/v1/db/users?id=eq.42" \\
  -H "apikey: truss_sk_YOUR_SERVICE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Updated Name"}'

# DELETE
curl -X DELETE "{{baseUrl}}/v1/db/users?id=eq.42" \\
  -H "apikey: truss_sk_YOUR_SERVICE_KEY"`,
    },
  },
  rpc: {
    label: "RPC Functions",
    code: {
      js: `// Call a Postgres function via the API
// First, create the function in SQL:
// CREATE FUNCTION get_active_users(min_age int DEFAULT 18)
// RETURNS SETOF users AS $$
//   SELECT * FROM users WHERE age >= min_age AND active = true;
// $$ LANGUAGE sql;

const resp = await fetch("{{baseUrl}}/v1/db/rpc/get_active_users", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: "truss_sk_YOUR_SERVICE_KEY",
  },
  body: JSON.stringify({ min_age: 21 }),
})
const users = await resp.json()`,
      python: `# Call a Postgres function via the API
resp = requests.post("{{baseUrl}}/v1/db/rpc/get_active_users",
    headers={"apikey": "truss_sk_YOUR_SERVICE_KEY"},
    json={"min_age": 21},
)
users = resp.json()`,
      go: `body, _ := json.Marshal(map[string]int{"min_age": 21})
req, _ := http.NewRequest("POST", "{{baseUrl}}/v1/db/rpc/get_active_users",
    bytes.NewReader(body))
req.Header.Set("Content-Type", "application/json")
req.Header.Set("apikey", "truss_sk_YOUR_SERVICE_KEY")
resp, _ := http.DefaultClient.Do(req)`,
      curl: `# Create a function first:
# CREATE FUNCTION get_active_users(min_age int DEFAULT 18)
# RETURNS SETOF users AS $$
#   SELECT * FROM users WHERE age >= min_age AND active = true;
# $$ LANGUAGE sql;

# Then call it:
curl -X POST "{{baseUrl}}/v1/db/rpc/get_active_users" \\
  -H "apikey: truss_sk_YOUR_SERVICE_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"min_age": 21}'`,
    },
  },
  rls: {
    label: "RLS Passthrough",
    code: {
      js: `// Pass a JWT with anon key to enable Row-Level Security
const resp = await fetch("{{baseUrl}}/v1/db/todos", {
  headers: {
    apikey: "truss_pk_YOUR_ANON_KEY",
    Authorization: "Bearer eyJhbGci...",  // User's JWT
  },
})

// Truss sets these before your query:
//   SET request.jwt.claims = '<jwt_payload>'
//   SET request.jwt.sub = '<user_id>'
//   SET ROLE authenticated
//
// Your RLS policies can reference:
//   current_setting('request.jwt.sub')::uuid = user_id

// Example RLS policy (run in SQL editor):
// CREATE POLICY "Users see own todos"
//   ON todos FOR SELECT
//   USING (user_id = current_setting('request.jwt.sub')::uuid);`,
      python: `import requests

# Pass JWT for RLS enforcement
resp = requests.get("{{baseUrl}}/v1/db/todos",
    headers={
        "apikey": "truss_pk_YOUR_ANON_KEY",
        "Authorization": "Bearer eyJhbGci...",
    },
)
# Only returns rows matching RLS policies
todos = resp.json()`,
      go: `req, _ := http.NewRequest("GET", "{{baseUrl}}/v1/db/todos", nil)
req.Header.Set("apikey", "truss_pk_YOUR_ANON_KEY")
req.Header.Set("Authorization", "Bearer eyJhbGci...")
resp, _ := http.DefaultClient.Do(req)
// Only returns rows matching RLS policies`,
      curl: `# RLS passthrough with JWT
curl "{{baseUrl}}/v1/db/todos" \\
  -H "apikey: truss_pk_YOUR_ANON_KEY" \\
  -H "Authorization: Bearer eyJhbGci..."

# Truss sets before your query:
#   SET request.jwt.claims = '<jwt_payload>'
#   SET request.jwt.sub = '<user_id>'
#   SET ROLE authenticated
#
# RLS policy example:
# CREATE POLICY "Users see own todos" ON todos FOR SELECT
#   USING (user_id = current_setting('request.jwt.sub')::uuid);`,
    },
  },
};

// ─── Module map ──────────────────────────────────────────────────────────────

const MODULE_MAP = {
  auth:      { snippets: AUTH_SNIPPETS },
  authz:     { snippets: AUTHZ_SNIPPETS, oplTemplates: AUTHZ_OPL_TEMPLATES },
  oauth2:    { snippets: OAUTH2_SNIPPETS },
  gateway:   { snippets: GATEWAY_SNIPPETS, ruleTemplates: GATEWAY_RULE_TEMPLATES, handlerSections: GATEWAY_HANDLER_SECTIONS },
  storage:   { snippets: STORAGE_SNIPPETS },
  search:    { snippets: SEARCH_SNIPPETS },
  webhooks:  { snippets: WEBHOOKS_SNIPPETS },
  realtime:  { snippets: REALTIME_SNIPPETS },
  edge:      { snippets: EDGE_SNIPPETS },
};

router.get("/api/config/sdk-snippets/:module", (req, res) => {
  const mod = MODULE_MAP[req.params.module];
  if (!mod) return res.status(404).json({ error: `Unknown module: ${req.params.module}` });

  res.set("Cache-Control", "public, max-age=3600");
  res.json(mod);
});
