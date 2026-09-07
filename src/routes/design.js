const express = require("express");
const { requireAdminAuth } = require("../admin-auth");
const { getDesignPayload, updateTheme, updateContent, updateOrder, resetDesign } = require("../design");

const router = express.Router();

// Unauthenticated on purpose: EVERY visitor's browser needs this to render
// the live page with whatever theme/content/order an admin has saved — the
// same way /api/status is public for the demo-mode banner. Nothing in the
// payload is sensitive; it's just the same overrides the page itself
// already shows.
router.get("/design", (req, res) => {
  res.json(getDesignPayload());
});

router.put("/design/theme", requireAdminAuth, (req, res) => {
  const result = updateTheme(req.body && req.body.vars);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true, settings: result.settings });
});

router.put("/design/content", requireAdminAuth, (req, res) => {
  const id = req.body && req.body.id;
  const text = req.body && req.body.text;
  const result = updateContent(id, text);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true, settings: result.settings });
});

router.put("/design/order", requireAdminAuth, (req, res) => {
  const group = req.body && req.body.group;
  const order = req.body && req.body.order;
  const result = updateOrder(group, order);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true, settings: result.settings });
});

router.post("/design/reset", requireAdminAuth, (req, res) => {
  const scope = (req.body && req.body.scope) || "all";
  if (!["theme", "content", "order", "all"].includes(scope)) {
    return res.status(400).json({ error: "scope must be one of: theme, content, order, all." });
  }
  const settings = resetDesign(scope);
  res.json({ ok: true, settings });
});

module.exports = router;
