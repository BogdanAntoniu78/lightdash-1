import { Colors, Menu } from '@blueprintjs/core';
import styled from 'styled-components';

export const MenuWrapper = styled(Menu)`
    padding: 1.214em 0.571em;
    display: flex;
    flex-direction: column;
`;

export const ButtonWrapper = styled.button`
    background: transparent;
    border: none;
    text-align: left;
    font-size: 14px;
    padding: 0;

    :focus,
    :active {
        outline: none;
    }

    :hover {
        cursor: pointer;
    }
`;

export const HelpItem = styled.div`
    width: 20em;
    display: grid;
    grid-template-columns: 3.571em auto;
    grid-column-gap: 1em;
    padding: 1.071em 1.429em;
    align-content: center;
    color: ${Colors.WHITE};
    margin: 0;

    :hover {
        background: #3e4e5b;
    }
`;

export const IconContainer = styled.div`
    width: 3.571em;
    height: 3.571em;
    background: ${Colors.GRAY1};
    border-radius: 0.214em;
    position: relative;
    align-self: center;

    span {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
    }

    svg {
        width: 1.429em;
        height: 1.429em;
    }
`;

export const ItemCTA = styled.p`
    line-height: 1.429em;
    font-weight: 600;
    margin: 0;
`;

export const ItemDescription = styled.p`
    color: ${Colors.GRAY5} !important;
    margin: 0;
`;
