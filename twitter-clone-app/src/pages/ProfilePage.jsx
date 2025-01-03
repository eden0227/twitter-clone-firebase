import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useLocalStorage from "use-local-storage";
import { Container, Row } from "react-bootstrap";
import ProfileSideBar from "../components/ProfileSideBar";
import ProfileMidBody from "../components/ProfileMidBody";

export default function ProfilePage() {
    const [authToken, setAuthToken] = useLocalStorage("authToken", "");
    const navigate = useNavigate();

    useEffect(() => {
        if (!authToken) {
            navigate("/login");
        }
    }, [authToken, navigate]);

    const handleLogout = () => {
        setAuthToken("");
    };

    return (
        <>
            <Container>
                <Row>
                    <ProfileSideBar handleLogout={handleLogout} />
                    <ProfileMidBody />
                </Row>
            </Container>
        </>
    )
}
