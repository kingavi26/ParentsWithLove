const express = require("express");
const { requireAdminAuth } = require("../admin-auth");
const {
  getDesignPayload,
  updateTheme,
  updateContent,
  updateOrder,
  updateVisibility,
  resetDesign
} = require("../landing-design");

const router = express.Router();

// Unauthenticated on purpose: EVERY visitor's browser needs this to render
// the live landing page with whatever theme/content/order/visibility an
// admin has saved — same pattern as GET /api/design for the app.
router.get("/landing-design", (req, res) => {
  res.json(getDesignPayload());
});

router.put("/landing-design/theme", requireAdminAuth, (req, res) => {
  const result = updateTheme(req.body && req.body.vars);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true, settings: result.settings });
});

router.put("/landing-design/content", requireAdminAuth, (req, res) => {
  const id = req.body && req.body.id;
  const text = req.body && req.body.text;
  const result = updateContent(id, text);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true, settings: result.settings });
});

router.put("/landing-design/order", requireAdminAuth, (req, res) => {
  const group = req.body && req.body.group;
  const order = req.body && req.body.order;
  const result = updateOrder(group, order);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true, settings: result.settings });
});

router.put("/landing-design/visibility", requireAdminAuth, (req, res) => {
  const id = req.body && req.body.id;
  const visible = req.body && req.body.visible;
  const result = updateVisibility(id, visible);
  if (result.error) return res.status(400).json({ error: result.error });
  res.json({ ok: true, settings: result.settings });
});

router.post("/landing-design/reset", requireAdminAuth, (req, res) => {
  const scope = (req.body && req.body.scope) || "all";
  if (!["theme", "content", "order", "hidden", "all"].includes(scope)) {
    return res.status(400).json({ error: "scope must be one of: theme, content, order, hidden, all." });
  }
  const settings = resetDesign(scope);
  res.json({ ok: true, settings });
});

module.exports = router;
