import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  AppBar, Toolbar, Typography, Avatar, Box, Card, CardContent, Chip, Switch, IconButton,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Button, Stack, Divider,
  Snackbar, Alert, Skeleton, LinearProgress, Tooltip, Container, Paper, Fade, Grow,
} from "@mui/material";
import {
  Edit, Notifications, NotificationsOff, LocationOn, LocationOff, Lock, Help, Info,
  Logout, ChevronRight, Assignment, CheckCircle, PendingActions, Star, ListAlt, TrackChanges,
  Close, Save, Visibility, VisibilityOff, Shield, Engineering, Person, AdminPanelSettings,
} from "@mui/icons-material";
import BottomNav from "../../components/BottomNav.jsx";
import WorkerBottomNav from "../../components/WorkerBottomNav.jsx";
import { useTheme } from "../../contexts/ThemeContext.jsx";
import {
  reportService, authService, profileService, permissionService,
} from "../../services.js";

const ROLE_CONFIG = {
  citizen: { label: "Citizen", icon: <Person />, color: "success", gradient: "linear-gradient(135deg, #006b2c, #00a843)" },
  cleanup_worker: { label: "Worker", icon: <Engineering />, color: "info", gradient: "linear-gradient(135deg, #0277bd, #0288d1)" },
  admin: { label: "Admin", icon: <AdminPanelSettings />, color: "secondary", gradient: "linear-gradient(135deg, #6a1b9a, #8e24aa)" },
  super_admin: { label: "Super Admin", icon: <Shield />, color: "warning", gradient: "linear-gradient(135deg, #e65100, #f57c00)" },
};

function StatCard({ icon, label, value, color, loading: isLoading }) {
  return (
    <Card
      elevation={0}
      sx={{
        minWidth: 130, borderRadius: 3, border: "1px solid", borderColor: "grey.100",
        background: "white", flexShrink: 0,
      }}
    >
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
          <Box sx={{ width: 36, height: 36, borderRadius: 2, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: `${color}.50` }}>
            {icon}
          </Box>
        </Box>
        <Typography variant="h5" fontWeight={800} color="grey.900" lineHeight={1}>
          {isLoading ? <Skeleton width={40} /> : value}
        </Typography>
        <Typography variant="caption" fontWeight={600} color="grey.500" sx={{ mt: 0.5, display: "block" }}>
          {label}
        </Typography>
      </CardContent>
    </Card>
  );
}

function SettingsRow({ icon, iconColor, title, subtitle, action, onClick }) {
  return (
    <Box
      onClick={onClick}
      sx={{
        display: "flex", alignItems: "center", gap: 2, px: 2.5, py: 2,
        cursor: onClick ? "pointer" : "default", borderRadius: 0,
        "&:active": onClick ? { bgcolor: "grey.50" } : {},
        transition: "background-color 0.15s",
      }}
    >
      <Box sx={{ width: 40, height: 40, borderRadius: 2.5, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: `${iconColor}.50`, flexShrink: 0 }}>
        {icon}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" fontWeight={700} color="grey.900">{title}</Typography>
        <Typography variant="caption" fontWeight={500} color="grey.400">{subtitle}</Typography>
      </Box>
      {action || <ChevronRight sx={{ color: "grey.300", fontSize: 20 }} />}
    </Box>
  );
}

export default function Profile() {
  const navigate = useNavigate();
  const { mode: themeMode, setThemeMode } = useTheme();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loggingOut, setLoggingOut] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [locationPermission, setLocationPermission] = useState("checking");

  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const [pwOpen, setPwOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState("");
  const [pwNew, setPwNew] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [showPwCurrent, setShowPwCurrent] = useState(false);
  const [showPwNew, setShowPwNew] = useState(false);

  const [toast, setToast] = useState({ open: false, msg: "", severity: "success" });

  useEffect(() => {
    const snapshot = authService.getSessionSnapshot();
    setCurrentUser(snapshot.currentUser);
    setEditName(snapshot.currentUser?.name || "");
    setEditPhone(snapshot.currentUser?.phone || "");
    checkLocationPermission();
    loadNotificationsSetting();
    reportService.getReports().then(setReports).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function showToast(msg, severity = "success") {
    setToast({ open: true, msg, severity });
  }

  async function checkLocationPermission() {
    if (!navigator.geolocation) { setLocationPermission("unavailable"); return; }
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: "geolocation" });
        if (status.state === "granted") { setLocationPermission("granted"); return; }
        if (status.state === "denied") { setLocationPermission("denied"); return; }
      }
      setLocationPermission("prompt");
    } catch { setLocationPermission("prompt"); }
  }

  function loadNotificationsSetting() {
    try {
      const val = localStorage.getItem("swachhlens-notifications-enabled");
      setNotificationsEnabled(val !== "false");
    } catch { setNotificationsEnabled(true); }
  }

  function toggleNotifications() {
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    try { localStorage.setItem("swachhlens-notifications-enabled", String(next)); } catch {}
    if (next) {
      permissionService.requestNotifications().then((status) => {
        if (status === "denied") {
          setNotificationsEnabled(false);
          localStorage.setItem("swachhlens-notifications-enabled", "false");
          showToast("Notifications blocked by browser", "warning");
        }
      });
    }
  }

  async function openLocationSettings() {
    if (locationPermission === "granted") { showToast("Location already active"); return; }
    try {
      const result = await permissionService.requestLocation();
      if (result.status === "granted") {
        setLocationPermission("granted");
        showToast("Location access granted");
      } else {
        setLocationPermission("denied");
        showToast(result.error || "Location denied — enable in browser settings", "warning");
      }
    } catch { setLocationPermission("denied"); }
  }

  const totalReports = reports.length;
  const resolvedReports = reports.filter((r) => r.status === "resolved").length;
  const pendingReports = reports.filter((r) => r.status !== "resolved" && r.status !== "rejected").length;
  const civicScore = totalReports * 10 + resolvedReports * 20;

  const userName = currentUser?.name || "User";
  const userEmail = currentUser?.email || "";
  const userPhone = currentUser?.phone || "";
  const userRole = currentUser?.role || "citizen";
  const userInitial = userName.charAt(0).toUpperCase();
  const isGoogleUser = currentUser?.uid?.startsWith("google-") || false;
  const roleConf = ROLE_CONFIG[userRole] || ROLE_CONFIG.citizen;

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try { await authService.logout(); } catch {}
    navigate("/login", { replace: true });
  };

  async function handleSaveProfile() {
    if (editSaving) return;
    setEditError("");
    const trimmedName = editName.trim();
    if (!trimmedName) { setEditError("Name is required"); return; }
    setEditSaving(true);
    try {
      const updated = await profileService.updateProfile({ name: trimmedName, phone: editPhone.trim() });
      setCurrentUser(updated);
      setEditOpen(false);
      showToast("Profile updated");
    } catch (err) { setEditError(err.message || "Failed to update profile"); }
    finally { setEditSaving(false); }
  }

  async function handleChangePassword() {
    if (pwSaving) return;
    setPwError(""); setPwSuccess("");
    if (!pwCurrent) { setPwError("Current password is required"); return; }
    if (!pwNew) { setPwError("New password is required"); return; }
    if (pwNew.length < 6) { setPwError("New password must be at least 6 characters"); return; }
    if (pwNew !== pwConfirm) { setPwError("Passwords do not match"); return; }
    if (pwCurrent === pwNew) { setPwError("New password must be different from current"); return; }
    setPwSaving(true);
    try {
      await profileService.changePassword({ currentPassword: pwCurrent, newPassword: pwNew });
      setPwSuccess("Password changed successfully");
      setPwCurrent(""); setPwNew(""); setPwConfirm("");
      setTimeout(() => { setPwOpen(false); setPwSuccess(""); }, 1500);
    } catch (err) { setPwError(err.message || "Failed to change password"); }
    finally { setPwSaving(false); }
  }

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: "background.default", pb: 12, transition: 'background-color 0.25s ease' }}>
      {/* Header */}
      <Paper elevation={0} sx={{ borderRadius: 0, borderBottom: "1px solid", borderColor: "grey.100" }}>
        <Container maxWidth="sm">
          <Toolbar sx={{ justifyContent: "space-between", px: 0, py: 1 }}>
            <Typography variant="h5" fontWeight={800} color="grey.900">
              Profile
            </Typography>
            <Tooltip title="Edit profile">
              <IconButton
                size="small"
                onClick={() => {
                  setEditName(currentUser?.name || "");
                  setEditPhone(currentUser?.phone || "");
                  setEditError("");
                  setEditOpen(true);
                }}
                sx={{ bgcolor: "white", border: "1px solid", borderColor: "grey.100", "&:hover": { bgcolor: "grey.50" } }}
              >
                <Edit fontSize="small" sx={{ color: "grey.500" }} />
              </IconButton>
            </Tooltip>
          </Toolbar>
        </Container>
      </Paper>

      <Container maxWidth="sm" sx={{ mt: 3 }}>
        {/* User Card */}
        <Grow in timeout={300}>
          <Card elevation={0} sx={{ borderRadius: 4, border: "1px solid", borderColor: "grey.100", overflow: "visible", mb: 3 }}>
            <CardContent sx={{ p: 3, display: "flex", alignItems: "center", gap: 2.5 }}>
              {currentUser?.photoURL ? (
                <Avatar src={currentUser.photoURL} alt={userName} sx={{ width: 64, height: 64, border: "3px solid", borderColor: "success.50" }} />
              ) : (
                <Avatar
                  sx={{
                    width: 64, height: 64, fontWeight: 800, fontSize: 24, color: "white",
                    background: roleConf.gradient,
                    boxShadow: "0 4px 14px rgba(0,107,44,0.25)",
                  }}
                >
                  {userInitial}
                </Avatar>
              )}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="subtitle1" fontWeight={800} color="grey.900" noWrap>
                  {userName}
                </Typography>
                <Typography variant="body2" fontWeight={500} color="grey.500" noWrap>
                  {userEmail}
                </Typography>
                {userPhone && (
                  <Typography variant="caption" fontWeight={500} color="grey.400" noWrap>
                    {userPhone}
                  </Typography>
                )}
              </Box>
              <Chip
                icon={roleConf.icon}
                label={roleConf.label}
                color={roleConf.color}
                size="small"
                variant="outlined"
                sx={{ fontWeight: 700, textTransform: "capitalize", height: 28 }}
              />
            </CardContent>
          </Card>
        </Grow>

        {/* Stats */}
        <Box sx={{ display: "flex", gap: 2, overflowX: "auto", pb: 1, mx: -2, px: 2, mb: 3, "&::-webkit-scrollbar": { display: "none" } }}>
          <StatCard icon={<Assignment sx={{ color: "info.main", fontSize: 18 }} />} label="Reports" value={totalReports} color="info" loading={loading} />
          <StatCard icon={<CheckCircle sx={{ color: "success.main", fontSize: 18 }} />} label="Resolved" value={resolvedReports} color="success" loading={loading} />
          <StatCard icon={<PendingActions sx={{ color: "warning.main", fontSize: 18 }} />} label="Pending" value={pendingReports} color="warning" loading={loading} />
          <StatCard icon={<Star sx={{ color: "secondary.main", fontSize: 18 }} />} label="Civic Score" value={civicScore} color="secondary" loading={loading} />
        </Box>

        {/* Quick Actions */}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "1fr 1fr" }, gap: 2, mb: 3 }}>
          <Card
            elevation={0}
            onClick={() => navigate("/my-reports")}
            sx={{ borderRadius: 3, border: "1px solid", borderColor: "grey.100", cursor: "pointer", "&:hover": { borderColor: "info.200" }, transition: "border-color 0.2s" }}
          >
            <CardContent sx={{ p: 2, display: "flex", alignItems: "center", gap: 1.5, "&:last-child": { pb: 2 } }}>
              <Box sx={{ width: 40, height: 40, borderRadius: 2.5, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "info.50" }}>
                <ListAlt sx={{ color: "info.main", fontSize: 20 }} />
              </Box>
              <Box>
                <Typography variant="body2" fontWeight={700} color="grey.900">My Reports</Typography>
                <Typography variant="caption" fontWeight={500} color="grey.400">View all</Typography>
              </Box>
            </CardContent>
          </Card>
          <Card
            elevation={0}
            onClick={() => navigate("/tracking")}
            sx={{ borderRadius: 3, border: "1px solid", borderColor: "grey.100", cursor: "pointer", "&:hover": { borderColor: "success.200" }, transition: "border-color 0.2s" }}
          >
            <CardContent sx={{ p: 2, display: "flex", alignItems: "center", gap: 1.5, "&:last-child": { pb: 2 } }}>
              <Box sx={{ width: 40, height: 40, borderRadius: 2.5, display: "flex", alignItems: "center", justifyContent: "center", bgcolor: "success.50" }}>
                <TrackChanges sx={{ color: "success.main", fontSize: 20 }} />
              </Box>
              <Box>
                <Typography variant="body2" fontWeight={700} color="grey.900">Track Cleanup</Typography>
                <Typography variant="caption" fontWeight={500} color="grey.400">Live status</Typography>
              </Box>
            </CardContent>
          </Card>
        </Box>

        {/* Settings */}
        <Card elevation={0} sx={{ borderRadius: 4, border: "1px solid", borderColor: "grey.100", mb: 3, overflow: "hidden" }}>
          <Box sx={{ px: 2.5, py: 1.5, borderBottom: "1px solid", borderColor: "grey.50" }}>
            <Typography variant="caption" fontWeight={700} color="grey.400" textTransform="uppercase" letterSpacing={1}>
              Settings
            </Typography>
          </Box>

          <SettingsRow
            icon={notificationsEnabled ? <Notifications sx={{ color: "info.main", fontSize: 20 }} /> : <NotificationsOff sx={{ color: "grey.400", fontSize: 20 }} />}
            iconColor="info"
            title="Notifications"
            subtitle={notificationsEnabled ? "Push alerts active" : "Push alerts paused"}
            action={
              <Switch
                size="small"
                checked={notificationsEnabled}
                onChange={toggleNotifications}
                color="success"
              />
            }
          />

          <Divider variant="inset" component="li" sx={{ mx: 2.5 }} />

          {/* Theme Switcher */}
          <SettingsRow
            icon={<Box sx={{ display: 'flex', fontSize: 20, color: themeMode === 'dark' ? 'grey.400' : 'grey.700' }}>
              {themeMode === 'dark' ? '🌙' : '☀️'}
            </Box>}
            iconColor={themeMode === 'dark' ? 'grey' : 'warning'}
            title="Appearance"
            subtitle={themeMode === 'dark' ? 'Dark mode active' : 'Light mode active'}
            action={
              <Box sx={{ display: 'flex', gap: 0, border: '1px solid', borderColor: 'grey.200', borderRadius: 2, p: 0.25 }}>
                {[
                  { key: 'light', icon: '☀️', tip: 'Light' },
                  { key: 'dark', icon: '🌙', tip: 'Dark' },
                ].map((opt) => (
                  <Box
                    key={opt.key}
                    onClick={() => setThemeMode(opt.key)}
                    title={opt.tip}
                    sx={{
                      width: 32, height: 28, borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', fontSize: 14, transition: 'all 0.2s',
                      bgcolor: themeMode === opt.key ? 'primary.main' : 'transparent',
                      color: themeMode === opt.key ? 'white' : 'grey.500',
                      '&:hover': { bgcolor: themeMode === opt.key ? 'primary.main' : 'grey.100' },
                    }}
                  >
                    {opt.icon}
                  </Box>
                ))}
              </Box>
            }
          />

          <Divider variant="inset" component="li" sx={{ mx: 2.5 }} />

          <SettingsRow
            icon={locationPermission === "granted" ? <LocationOn sx={{ color: "success.main", fontSize: 20 }} /> : <LocationOff sx={{ color: "error.main", fontSize: 20 }} />}
            iconColor={locationPermission === "granted" ? "success" : "error"}
            title="Location"
            subtitle={
              locationPermission === "granted" ? "Access granted" :
              locationPermission === "denied" ? "Access denied" :
              locationPermission === "unavailable" ? "Not supported" : "Not yet allowed"
            }
            action={
              <Chip
                label={locationPermission === "granted" ? "Active" : "Inactive"}
                size="small"
                color={locationPermission === "granted" ? "success" : "error"}
                variant="outlined"
                sx={{ fontWeight: 700, height: 24, fontSize: 11 }}
              />
            }
            onClick={openLocationSettings}
          />

          {!isGoogleUser && (
            <>
              <Divider variant="inset" component="li" sx={{ mx: 2.5 }} />
              <SettingsRow
                icon={<Lock sx={{ color: "warning.main", fontSize: 20 }} />}
                iconColor="warning"
                title="Change Password"
                subtitle="Update your password"
                onClick={() => {
                  setPwCurrent(""); setPwNew(""); setPwConfirm("");
                  setPwError(""); setPwSuccess(""); setPwOpen(true);
                }}
              />
            </>
          )}

          <Divider variant="inset" component="li" sx={{ mx: 2.5 }} />

          <SettingsRow
            icon={<Help sx={{ color: "secondary.main", fontSize: 20 }} />}
            iconColor="secondary"
            title="Help & Support"
            subtitle="support@swachhlens.app"
          />

          <Divider variant="inset" component="li" sx={{ mx: 2.5 }} />

          <SettingsRow
            icon={<Info sx={{ color: "grey.500", fontSize: 20 }} />}
            iconColor="grey"
            title="About"
            subtitle="SwachhLens v1.0.0 · TechNova 2026"
          />
        </Card>

        {/* Logout */}
        <Button
          fullWidth
          variant="outlined"
          color="error"
          size="large"
          disabled={loggingOut}
          onClick={handleLogout}
          startIcon={<Logout />}
          sx={{
            borderRadius: 3, py: 1.5, fontWeight: 700, textTransform: "none",
            borderWidth: 2, "&:hover": { borderWidth: 2 },
          }}
        >
          {loggingOut ? "Signing out..." : "Logout"}
        </Button>

        {/* Footer */}
        <Typography variant="caption" color="grey.400" align="center" display="block" sx={{ mt: 3, mb: 2 }}>
          Made for TechNova 2026
        </Typography>
      </Container>

      {/* Bottom Nav */}
      {userRole === "cleanup_worker" ? (
        <WorkerBottomNav active="profile" />
      ) : (
        <BottomNav active="profile" />
      )}

      {/* Toast */}
      <Snackbar
        open={toast.open}
        autoHideDuration={2500}
        onClose={() => setToast({ ...toast, open: false })}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <Alert
          onClose={() => setToast({ ...toast, open: false })}
          severity={toast.severity}
          variant="filled"
          sx={{ borderRadius: 3, fontWeight: 600 }}
        >
          {toast.msg}
        </Alert>
      </Snackbar>

      {/* Edit Profile Dialog */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 4, mx: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Edit Profile
          <IconButton size="small" onClick={() => setEditOpen(false)}>
            <Close fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 3 }}>
          <Stack spacing={3}>
            <TextField
              label="Name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              fullWidth
              variant="outlined"
              size="medium"
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 } }}
            />
            <TextField
              label="Phone"
              value={editPhone}
              onChange={(e) => setEditPhone(e.target.value)}
              fullWidth
              variant="outlined"
              placeholder="Optional"
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 } }}
            />
            <TextField
              label="Email"
              value={userEmail}
              disabled
              fullWidth
              variant="outlined"
              helperText="Email cannot be changed"
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 } }}
            />
            {editError && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>{editError}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setEditOpen(false)} sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSaveProfile}
            disabled={editSaving}
            startIcon={editSaving ? undefined : <Save />}
            sx={{
              borderRadius: 2, textTransform: "none", fontWeight: 700, px: 4,
              background: "linear-gradient(135deg, #006b2c, #00a843)",
              "&:hover": { background: "linear-gradient(135deg, #005a24, #009438)" },
            }}
          >
            {editSaving ? "Saving..." : "Save"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Change Password Dialog */}
      <Dialog
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 4, mx: 2 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          Change Password
          <IconButton size="small" onClick={() => setPwOpen(false)}>
            <Close fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 3 }}>
          <Stack spacing={3}>
            <TextField
              label="Current Password"
              type={showPwCurrent ? "text" : "password"}
              value={pwCurrent}
              onChange={(e) => setPwCurrent(e.target.value)}
              fullWidth
              variant="outlined"
              InputProps={{
                endAdornment: (
                  <IconButton size="small" onClick={() => setShowPwCurrent(!showPwCurrent)} edge="end">
                    {showPwCurrent ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                ),
              }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 } }}
            />
            <TextField
              label="New Password"
              type={showPwNew ? "text" : "password"}
              value={pwNew}
              onChange={(e) => setPwNew(e.target.value)}
              fullWidth
              variant="outlined"
              helperText={pwNew.length > 0 ? `${pwNew.length} characters` : "At least 6 characters"}
              InputProps={{
                endAdornment: (
                  <IconButton size="small" onClick={() => setShowPwNew(!showPwNew)} edge="end">
                    {showPwNew ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                  </IconButton>
                ),
              }}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 } }}
            />
            <TextField
              label="Confirm New Password"
              type="password"
              value={pwConfirm}
              onChange={(e) => setPwConfirm(e.target.value)}
              fullWidth
              variant="outlined"
              error={pwConfirm.length > 0 && pwNew !== pwConfirm}
              helperText={pwConfirm.length > 0 ? (pwNew === pwConfirm ? "Passwords match" : "Passwords don't match") : ""}
              sx={{ "& .MuiOutlinedInput-root": { borderRadius: 2.5 } }}
            />
            {pwNew.length > 0 && (
              <Box>
                <LinearProgress
                  variant="determinate"
                  value={Math.min(pwNew.length * 10, 100)}
                  color={pwNew.length >= 6 ? "success" : "warning"}
                  sx={{ height: 4, borderRadius: 2 }}
                />
              </Box>
            )}
            {pwError && <Alert severity="error" sx={{ borderRadius: 2 }}>{pwError}</Alert>}
            {pwSuccess && <Alert severity="success" sx={{ borderRadius: 2 }}>{pwSuccess}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setPwOpen(false)} sx={{ borderRadius: 2, textTransform: "none", fontWeight: 600 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleChangePassword}
            disabled={pwSaving}
            sx={{
              borderRadius: 2, textTransform: "none", fontWeight: 700, px: 4,
              background: "linear-gradient(135deg, #006b2c, #00a843)",
              "&:hover": { background: "linear-gradient(135deg, #005a24, #009438)" },
            }}
          >
            {pwSaving ? "Changing..." : "Change Password"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
